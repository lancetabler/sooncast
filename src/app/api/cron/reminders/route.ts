import { prisma } from "@/lib/prisma";
import { ok, bad } from "@/lib/api";
import { expandAll, reminderFires } from "@/lib/domain/recurrence";
import { reminderLabel } from "@/lib/domain/format";
import { parseIntArray } from "@/lib/serialize";
import { sendPush, pushReady } from "@/lib/push";
import { getLiveStatuses, scoreString } from "@/lib/live";
import type { TrackEvent } from "@/lib/domain/types";

// How far back to catch fires that just came due. Set CRON_LOOKBACK_MIN to your
// pinger interval + 1 (e.g. a 5-minute pinger -> 6). Dedupe prevents double-sends.
const LOOKBACK_MS = Math.max(1, Number(process.env.CRON_LOOKBACK_MIN) || 2) * 60_000;
const MAX_REMINDER_MIN = 10080; // 1 week — how far ahead a fire's occurrence can be

export const maxDuration = 60; // allow the batch to finish on slower runs
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // if unset (local dev), allow
  const url = new URL(req.url);
  return (
    req.headers.get("x-cron-secret") === secret ||
    req.headers.get("authorization") === `Bearer ${secret}` ||
    url.searchParams.get("secret") === secret
  );
}

function minutesOfDayInTz(now: Date, tz: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return h * 60 + m;
  } catch {
    return null;
  }
}
function inQuietHours(mins: number, start: number, end: number): boolean {
  return start <= end ? mins >= start && mins < end : mins >= start || mins < end;
}

async function run(req: Request) {
  if (!authorized(req)) return bad("Unauthorized", 401);
  if (!pushReady()) return ok({ ok: true, note: "push not configured", sent: 0 });

  const now = Date.now();
  const from = new Date(now - 6 * 3600_000);
  const to = new Date(now + MAX_REMINDER_MIN * 60_000);

  const users = await prisma.user.findMany({
    where: { subscriptions: { some: {} } },
    include: { subscriptions: true, events: true, follows: true },
  });

  let sent = 0;
  let checkedUsers = 0;

  async function pushAll(user: (typeof users)[number], title: string, body: string, tag: string, url?: string) {
    for (const s of user.subscriptions) {
      const status = await sendPush(s, { title, body, tag, url });
      if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      else if (status >= 200 && status < 300) sent++;
    }
  }

  for (const user of users) {
    checkedUsers++;
    if (user.quietStart != null && user.quietEnd != null) {
      const mod = minutesOfDayInTz(new Date(now), user.timezone);
      if (mod != null && inQuietHours(mod, user.quietStart, user.quietEnd)) continue;
    }

    const mutedFollowIds = new Set(user.follows.filter((f) => f.muted).map((f) => f.id));
    const followRefById = new Map(user.follows.map((f) => [f.id, f.ref]));

    /* ---- reminders ---- */
    const track: TrackEvent[] = user.events
      .filter((e) => !(e.followId && mutedFollowIds.has(e.followId)))
      .map((e) => ({
        id: e.id, title: e.title, categoryId: e.categoryId, start: e.start.toISOString(),
        allDay: e.allDay, durationMin: e.durationMin, freq: e.freq as TrackEvent["freq"],
        until: e.until ? e.until.toISOString() : null, reminders: parseIntArray(e.reminders),
        location: e.location, url: e.url, note: e.note, imageUrl: e.imageUrl,
      }));

    const occ = expandAll(track, from, to);
    const due = reminderFires(occ).filter((f) => {
      const t = f.fireAt.getTime();
      return t <= now && t > now - LOOKBACK_MS;
    });

    for (const fire of due) {
      const existing = await prisma.reminderLog.findUnique({ where: { key: fire.key } });
      if (existing) continue;
      await prisma.reminderLog.create({ data: { userId: user.id, key: fire.key } });
      const body =
        fire.minutes === 0
          ? "Starting now" + (fire.location ? ` · ${fire.location}` : "")
          : `${reminderLabel(fire.minutes).replace(" before", "")} — starts soon` + (fire.location ? ` · ${fire.location}` : "");
      await pushAll(user, fire.title, body, fire.key, fire.url ?? undefined);
    }

    /* ---- live score-change & final alerts (ESPN team sports) ---- */
    const liveCandidates = user.events.filter(
      (e) =>
        e.sourceProvider === "espn" &&
        e.followId && !mutedFollowIds.has(e.followId) && followRefById.get(e.followId)?.includes("/teams/") &&
        e.liveState !== "post" &&
        e.start.getTime() <= now + 15 * 60_000 &&
        e.start.getTime() >= now - 5 * 3600_000
    );
    if (liveCandidates.length) {
      const statuses = await getLiveStatuses(
        liveCandidates.map((e) => ({ eventId: e.id, sourceExtId: e.sourceExtId, followRef: followRefById.get(e.followId!) ?? null, start: e.start }))
      );
      for (const e of liveCandidates) {
        const st = statuses[e.id];
        if (!st) continue;
        const newScore = scoreString(st);
        if (st.state === "in") {
          // silently record the first score we see, then alert on subsequent changes
          if (newScore && e.liveScore && newScore !== e.liveScore) {
            await pushAll(user, `🚨 ${e.title}`, `${newScore}${st.detail ? " · " + st.detail : ""}`, `score-${e.id}-${newScore}`, e.url ?? undefined);
          }
          if (newScore !== e.liveScore || e.liveState !== "in") {
            await prisma.event.update({ where: { id: e.id }, data: { liveScore: newScore, liveState: "in" } });
          }
        } else if (st.state === "post" && e.liveState !== "post") {
          await pushAll(user, `Final · ${e.title}`, newScore ?? "Final", `final-${e.id}`, e.url ?? undefined);
          await prisma.event.update({ where: { id: e.id }, data: { liveScore: newScore, liveState: "post" } });
        }
      }
    }
  }

  return ok({ ok: true, checkedUsers, sent });
}

export async function POST(req: Request) {
  return run(req);
}
export async function GET(req: Request) {
  return run(req);
}
