import { prisma } from "@/lib/prisma";
import { ok, bad } from "@/lib/api";
import { expandAll } from "@/lib/domain/recurrence";
import { parseIntArray } from "@/lib/serialize";
import { sendPush, pushReady } from "@/lib/push";
import type { TrackEvent } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const url = new URL(req.url);
  return (
    req.headers.get("x-cron-secret") === secret ||
    req.headers.get("authorization") === `Bearer ${secret}` ||
    url.searchParams.get("secret") === secret
  );
}

// A once-a-day "here's your day" summary. Point a daily pinger at this at your
// preferred morning time. Covers events in the next ~18 hours.
async function run(req: Request) {
  if (!authorized(req)) return bad("Unauthorized", 401);
  if (!pushReady()) return ok({ ok: true, note: "push not configured" });

  const now = Date.now();
  const from = new Date(now);
  const to = new Date(now + 18 * 3600_000);

  const users = await prisma.user.findMany({ include: { subscriptions: true, events: true, follows: true } });
  let sent = 0;

  for (const user of users) {
    if (!user.subscriptions.length) continue;
    const muted = new Set(user.follows.filter((f) => f.muted).map((f) => f.id));

    const track: TrackEvent[] = user.events
      .filter((e) => !(e.followId && muted.has(e.followId)))
      .map((e) => ({
        id: e.id, title: e.title, categoryId: e.categoryId, start: e.start.toISOString(),
        allDay: e.allDay, durationMin: e.durationMin, freq: e.freq as TrackEvent["freq"],
        until: e.until ? e.until.toISOString() : null, reminders: parseIntArray(e.reminders),
        countUp: e.countUp, location: e.location, url: e.url, note: e.note, imageUrl: e.imageUrl,
      }));

    const occ = expandAll(track, from, to).filter((o) => !o.event.countUp);
    if (!occ.length) continue;

    const titles = occ.slice(0, 3).map((o) => o.event.title).join(", ");
    const body = `${occ.length} coming up: ${titles}${occ.length > 3 ? "…" : ""}`;
    for (const s of user.subscriptions) {
      const status = await sendPush(s, { title: "Your day 📡", body, tag: `digest-${new Date().toDateString()}` });
      if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      else if (status >= 200 && status < 300) sent++;
    }
  }

  return ok({ ok: true, sent });
}

export async function POST(req: Request) {
  return run(req);
}
export async function GET(req: Request) {
  return run(req);
}
