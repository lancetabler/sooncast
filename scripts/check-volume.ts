/* How many notifications will the user actually receive per day once the engine runs?
   Run from d:\Tracker:  npx tsx scripts/check-volume.ts   */
import { prisma } from "../src/lib/prisma";
import { expandAll, reminderFires } from "../src/lib/domain/recurrence";
import { parseIntArray } from "../src/lib/serialize";
import type { TrackEvent } from "../src/lib/domain/types";

async function main() {
  const now = Date.now();
  const from = new Date(now);
  const to = new Date(now + 30 * 86400_000);

  const users = await prisma.user.findMany({
    include: { follows: true, events: { where: { start: { lte: to }, OR: [{ freq: { not: "none" } }, { start: { gte: from } }] } } },
  });

  for (const u of users) {
    const labelByFollow = new Map(u.follows.map((f) => [f.id, f.label]));
    const followByEvent = new Map(u.events.map((e) => [e.id, e.followId]));

    const track: TrackEvent[] = u.events.map((e) => ({
      id: e.id, title: e.title, categoryId: e.categoryId, start: e.start.toISOString(),
      allDay: e.allDay, durationMin: e.durationMin, freq: e.freq as TrackEvent["freq"],
      until: e.until ? e.until.toISOString() : null, reminders: parseIntArray(e.reminders),
      countUp: e.countUp, location: e.location, url: e.url, note: e.note, imageUrl: e.imageUrl,
    }));

    const fires = reminderFires(expandAll(track, from, to, u.timezone)).filter((f) => f.fireAt.getTime() > now);
    console.log(`\n=== ${u.email} — ${fires.length} push notifications in the next 30 days ===`);

    const byDay = new Map<string, number>();
    for (const f of fires) {
      const d = f.fireAt.toLocaleDateString("en-CA", { timeZone: u.timezone });
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
    }
    const days = [...byDay.entries()].sort();
    console.log(`busiest days:`);
    for (const [d, n] of [...days].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`   ${d}: ${n}`);
    const avg = fires.length / Math.max(days.length, 1);
    console.log(`average per active day: ${avg.toFixed(1)}`);

    const bySource = new Map<string, number>();
    for (const f of fires) {
      const fid = followByEvent.get(f.eventId);
      const label = (fid && labelByFollow.get(fid)) || "manual / other";
      bySource.set(label, (bySource.get(label) ?? 0) + 1);
    }
    console.log(`by follow:`);
    for (const [label, n] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(4)}  ${label}`);

    // Whole-season projection: every future event currently stored, x its reminders.
    const allFuture = await prisma.event.count({ where: { userId: u.id, start: { gte: new Date() } } });
    console.log(`\nfuture events stored: ${allFuture}  (x ${parseIntArray(u.defaultReminders).length} reminders each = ~${allFuture * parseIntArray(u.defaultReminders).length} pushes/season)`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
