/* Will notifications actually fire? Reports device tokens, quiet hours, and the next
   scheduled reminder fires for every user.
   Run from d:\Tracker:  npx tsx scripts/check-notifications.ts   */
import { prisma } from "../src/lib/prisma";
import { expandAll, reminderFires } from "../src/lib/domain/recurrence";
import { parseIntArray } from "../src/lib/serialize";
import type { TrackEvent } from "../src/lib/domain/types";

async function main() {
  const now = Date.now();
  const from = new Date(now - 6 * 3600_000);
  const to = new Date(now + 7 * 86400_000);

  const users = await prisma.user.findMany({
    include: {
      expoPushTokens: true,
      subscriptions: true,
      follows: true,
      events: { where: { start: { lte: to }, OR: [{ freq: { not: "none" } }, { start: { gte: from } }] } },
    },
  });

  for (const u of users) {
    console.log(`\n=== ${u.email} ===`);
    console.log(`timezone: ${u.timezone}   quietHours: ${u.quietStart ?? "-"}..${u.quietEnd ?? "-"}   spoilerMode: ${u.spoilerMode}`);
    console.log(`expo push tokens: ${u.expoPushTokens.length}   web subs: ${u.subscriptions.length}`);
    for (const t of u.expoPushTokens) console.log(`   token ...${t.token.slice(-12)}  added ${t.createdAt.toISOString().slice(0, 16)}`);
    console.log(`defaultReminders: ${u.defaultReminders}`);
    console.log(`events in window: ${u.events.length}`);

    const noReminders = u.events.filter((e) => parseIntArray(e.reminders).length === 0).length;
    console.log(`events with NO reminders set: ${noReminders}`);

    const muted = new Set(u.follows.filter((f) => f.muted).map((f) => f.id));
    console.log(`follows: ${u.follows.length}  muted: ${muted.size}  scoreAlerts off: ${u.follows.filter((f) => !f.scoreAlerts).length}`);
    const teamFollows = u.follows.filter((f) => f.ref.includes("/teams/"));
    console.log(`team follows (eligible for score alerts): ${teamFollows.map((f) => f.label).join(", ") || "none"}`);

    const track: TrackEvent[] = u.events
      .filter((e) => !(e.followId && muted.has(e.followId)))
      .map((e) => ({
        id: e.id, title: e.title, categoryId: e.categoryId, start: e.start.toISOString(),
        allDay: e.allDay, durationMin: e.durationMin, freq: e.freq as TrackEvent["freq"],
        until: e.until ? e.until.toISOString() : null, reminders: parseIntArray(e.reminders),
        countUp: e.countUp, location: e.location, url: e.url, note: e.note, imageUrl: e.imageUrl,
      }));

    const occ = expandAll(track, from, to, u.timezone);
    const fires = reminderFires(occ)
      .filter((f) => f.fireAt.getTime() > now)
      .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());

    console.log(`\nupcoming reminder fires (next 7 days): ${fires.length}`);
    for (const f of fires.slice(0, 12)) {
      const mins = Math.round((f.fireAt.getTime() - now) / 60000);
      const local = f.fireAt.toLocaleString("en-US", { timeZone: u.timezone, weekday: "short", hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
      console.log(`   in ${String(mins).padStart(6)}m  ${local}  [${f.minutes}m before]  ${f.title.slice(0, 52)}`);
    }

    const already = await prisma.reminderLog.count({ where: { userId: u.id } });
    console.log(`\nreminderLog rows (already-sent claims): ${already}`);
    const recent = await prisma.reminderLog.findMany({ where: { userId: u.id }, orderBy: { sentAt: "desc" }, take: 8 });
    for (const r of recent) console.log(`   ${r.sentAt.toISOString().slice(0, 16)}  ${r.key.slice(0, 70)}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
