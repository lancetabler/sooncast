import "server-only";
import { prisma } from "@/lib/prisma";
import { expandAll, reminderFires } from "@/lib/domain/recurrence";
import { reminderLabel } from "@/lib/domain/format";
import { parseIntArray } from "@/lib/serialize";
import { sendPush, pushReady } from "@/lib/push";
import { getLiveStatuses, scoreString } from "@/lib/live";
import { runFollowImport } from "@/lib/import";
import type { TrackEvent } from "@/lib/domain/types";

// How far back to catch fires that just came due. Set CRON_LOOKBACK_MIN to your
// pinger interval + 1 (e.g. a 5-minute pinger -> 6). Dedupe prevents double-sends.
const LOOKBACK_MS = Math.max(1, Number(process.env.CRON_LOOKBACK_MIN) || 2) * 60_000;
const MAX_REMINDER_MIN = 10080; // 1 week — how far ahead a fire's occurrence can be

function minutesOfDayInTz(now: Date, tz: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
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
/** Calendar date (YYYY-MM-DD) in a given timezone — used to dedupe once-a-day digests. */
function dateInTz(now: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function toTrack(e: {
  id: string; title: string; categoryId: string | null; start: Date; allDay: boolean; durationMin: number;
  freq: string; until: Date | null; reminders: string; countUp?: boolean; location: string | null; url: string | null; note: string | null; imageUrl: string | null;
}): TrackEvent {
  return {
    id: e.id, title: e.title, categoryId: e.categoryId, start: e.start.toISOString(),
    allDay: e.allDay, durationMin: e.durationMin, freq: e.freq as TrackEvent["freq"],
    until: e.until ? e.until.toISOString() : null, reminders: parseIntArray(e.reminders),
    countUp: e.countUp, location: e.location, url: e.url, note: e.note, imageUrl: e.imageUrl,
  };
}

export interface ReminderResult {
  checkedUsers: number;
  sent: number;
}

/** Per-minute work: due reminders + live score-change / final alerts for followed team sports. */
export async function runReminders(): Promise<ReminderResult> {
  if (!pushReady()) return { checkedUsers: 0, sent: 0 };

  const now = Date.now();
  const from = new Date(now - 6 * 3600_000);
  const to = new Date(now + MAX_REMINDER_MIN * 60_000);

  const users = await prisma.user.findMany({
    where: { subscriptions: { some: {} } },
    include: {
      subscriptions: true,
      follows: true,
      events: { where: { start: { lte: to }, OR: [{ freq: { not: "none" } }, { start: { gte: from } }] } },
    },
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
    const noScoreFollowIds = new Set(user.follows.filter((f) => !f.scoreAlerts).map((f) => f.id));
    const followRefById = new Map(user.follows.map((f) => [f.id, f.ref]));

    /* ---- reminders ---- */
    const track: TrackEvent[] = user.events.filter((e) => !(e.followId && mutedFollowIds.has(e.followId))).map(toTrack);
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

    /* ---- live score-change & final alerts (ESPN team sports; skipped when the follow opts out) ---- */
    const liveCandidates = user.events.filter(
      (e) =>
        e.sourceProvider === "espn" &&
        e.followId && !mutedFollowIds.has(e.followId) && !noScoreFollowIds.has(e.followId) &&
        followRefById.get(e.followId)?.includes("/teams/") &&
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

  return { checkedUsers, sent };
}

export interface DigestResult {
  sent: number;
}

/**
 * Once-a-day "here's your day" summary of the next ~18h.
 * - force (dedicated morning pinger): always send.
 * - morning gate (unified tick): only when it's 7–10am in the user's timezone and
 *   they haven't had today's digest yet (deduped via ReminderLog).
 */
export async function runDigest({ force = false }: { force?: boolean } = {}): Promise<DigestResult> {
  if (!pushReady()) return { sent: 0 };

  const now = Date.now();
  const from = new Date(now);
  const to = new Date(now + 18 * 3600_000);

  const users = await prisma.user.findMany({
    include: {
      subscriptions: true,
      follows: true,
      events: { where: { start: { lte: to }, OR: [{ freq: { not: "none" } }, { start: { gte: from } }] } },
    },
  });
  let sent = 0;

  for (const user of users) {
    if (!user.subscriptions.length) continue;

    if (!force) {
      const mod = minutesOfDayInTz(new Date(now), user.timezone);
      if (mod == null || mod < 7 * 60 || mod >= 10 * 60) continue; // morning window only
      const key = `digest@${dateInTz(new Date(now), user.timezone)}`;
      const already = await prisma.reminderLog.findUnique({ where: { key: `${user.id}:${key}` } });
      if (already) continue;
      await prisma.reminderLog.create({ data: { userId: user.id, key: `${user.id}:${key}` } });
    }

    const muted = new Set(user.follows.filter((f) => f.muted).map((f) => f.id));
    const track: TrackEvent[] = user.events.filter((e) => !(e.followId && muted.has(e.followId))).map(toTrack);
    const occ = expandAll(track, from, to).filter((o) => !o.event.countUp);
    if (!occ.length) continue;

    const titles = occ.slice(0, 3).map((o) => o.event.title).join(", ");
    const body = `${occ.length} coming up: ${titles}${occ.length > 3 ? "…" : ""}`;
    for (const s of user.subscriptions) {
      const status = await sendPush(s, { title: "Your day 📡", body, tag: `digest-${dateInTz(new Date(now), user.timezone)}` });
      if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      else if (status >= 200 && status < 300) sent++;
    }
  }

  return { sent };
}

export interface SyncResult {
  follows: number;
  added: number;
  failed: number;
  pruned: number;
}

/** Re-import every followed source and push when new fixtures appear; prune stale past imports. */
export async function runSync(): Promise<SyncResult> {
  const users = await prisma.user.findMany({ include: { follows: true, subscriptions: true } });
  let follows = 0;
  let added = 0;
  let failed = 0;

  for (const user of users) {
    let userAdded = 0;
    for (const f of user.follows) {
      follows++;
      try {
        const res = await runFollowImport(user.id, f);
        userAdded += res.added;
      } catch {
        failed++;
      }
    }
    added += userAdded;

    if (userAdded > 0 && pushReady() && user.subscriptions.length) {
      const body = `${userAdded} new event${userAdded > 1 ? "s" : ""} added from the things you follow.`;
      for (const sub of user.subscriptions) {
        const status = await sendPush(sub, { title: "New on Radarr 📡", body, tag: `newevents-${user.id}-${Date.now()}` });
        if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }
    }
  }

  // Prune old auto-imported one-offs so the DB (and every /api/state payload) stays lean.
  // Keeps: manual events, recurring events, anything watched, anything <60 days old.
  const pruneBefore = new Date(Date.now() - 60 * 86400_000);
  const pruned = await prisma.event
    .deleteMany({ where: { followId: { not: null }, freq: "none", watchedAt: null, start: { lt: pruneBefore } } })
    .then((r) => r.count)
    .catch(() => 0);

  return { follows, added, failed, pruned };
}
