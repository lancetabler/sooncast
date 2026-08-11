/* How many notifications will the user actually receive per day, under their current policy?
   Run from d:\Tracker:  npx tsx scripts/check-volume.ts   */
import { prisma } from "../src/lib/prisma";
import { expandAll, reminderFires } from "../src/lib/domain/recurrence";
import { followNotifies, type NotifyScope } from "../src/lib/domain/notify";
import { parseIntArray } from "../src/lib/serialize";
import type { TrackEvent } from "../src/lib/domain/types";

async function main() {
  const now = Date.now();
  const from = new Date(now);
  const to = new Date(now + 30 * 86400_000);

  const users = await prisma.user.findMany({
    include: { follows: true, events: { where: { start: { lte: to }, OR: [{ freq: { not: "none" } }, { start: { gte: from } }] } } },
  });

  // Same 30-day per-follow volume the cron and /api/state use.
  const monthly = await prisma.event.groupBy({
    by: ["followId"],
    where: { followId: { not: null }, start: { gte: from, lte: to } },
    _count: true,
  });
  const perMonth = new Map(monthly.map((r) => [r.followId as string, r._count]));

  for (const u of users) {
    const scope = u.notifyScope as NotifyScope;
    const labelByFollow = new Map(u.follows.map((f) => [f.id, f.label]));
    const notifying = new Set(u.follows.filter((f) => followNotifies(scope, f, perMonth.get(f.id) ?? 0)).map((f) => f.id));
    const followByEvent = new Map(u.events.map((e) => [e.id, e.followId]));

    const toTrack = (e: (typeof u.events)[number]): TrackEvent => ({
      id: e.id, title: e.title, categoryId: e.categoryId, start: e.start.toISOString(),
      allDay: e.allDay, durationMin: e.durationMin, freq: e.freq as TrackEvent["freq"],
      until: e.until ? e.until.toISOString() : null, reminders: parseIntArray(e.reminders),
      countUp: e.countUp, location: e.location, url: e.url, note: e.note, imageUrl: e.imageUrl,
    });

    const countFires = (events: typeof u.events) =>
      reminderFires(expandAll(events.map(toTrack), from, to, u.timezone)).filter((f) => f.fireAt.getTime() > now);

    const before = countFires(u.events);
    const after = countFires(u.events.filter((e) => !e.followId || notifying.has(e.followId)));

    console.log(`\n=== ${u.email} — scope "${scope}" ===`);
    console.log(`pushes in the next 30 days: ${after.length}   (was ${before.length} with no policy)`);
    console.log(`follows sending reminders: ${notifying.size} of ${u.follows.length}`);

    const byDay = new Map<string, number>();
    for (const f of after) {
      const d = f.fireAt.toLocaleDateString("en-CA", { timeZone: u.timezone });
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
    }
    const busiest = [...byDay.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log(`busiest days: ${busiest.map(([d, n]) => `${d}:${n}`).join("  ") || "none"}`);

    const bySource = new Map<string, number>();
    for (const f of after) {
      const fid = followByEvent.get(f.eventId);
      const label = (fid && labelByFollow.get(fid)) || "manual / other";
      bySource.set(label, (bySource.get(label) ?? 0) + 1);
    }
    for (const [label, n] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(4)}  ${label}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
