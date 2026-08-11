/* When will live score alerts actually have something to alert about?
   Lists the next games for every score-alert-eligible team follow, and proves the
   live-status ESPN call works.
   Run from d:\Tracker:  npx tsx scripts/check-live.ts   */
import { prisma } from "../src/lib/prisma";
import { getLiveStatuses } from "../src/lib/live";

async function main() {
  const now = new Date();
  const follows = await prisma.follow.findMany({ where: { ref: { contains: "/teams/" } } });
  console.log(`${follows.length} team follow(s) — the only ones that get score/final pushes\n`);

  for (const f of follows) {
    const next = await prisma.event.findMany({
      where: { followId: f.id, start: { gte: now } },
      orderBy: { start: "asc" },
      take: 3,
    });
    console.log(`${f.label}  (scoreAlerts: ${f.scoreAlerts ? "on" : "OFF"}, muted: ${f.muted})`);
    if (!next.length) console.log("   no upcoming games imported");
    for (const e of next) {
      const days = Math.round((e.start.getTime() - now.getTime()) / 86400_000);
      console.log(`   ${e.start.toISOString().slice(0, 16)}Z  (in ${days}d)  ${e.title}`);
    }
    console.log("");
  }

  // Prove the live-scores ESPN path works from here (same helper the cron uses).
  const soon = await prisma.event.findFirst({
    where: { sourceProvider: "espn", start: { gte: new Date(now.getTime() - 6 * 3600_000) } },
    orderBy: { start: "asc" },
  });
  if (soon) {
    const follow = soon.followId ? await prisma.follow.findUnique({ where: { id: soon.followId } }) : null;
    const st = await getLiveStatuses([
      { eventId: soon.id, sourceExtId: soon.sourceExtId, followRef: follow?.ref ?? null, start: soon.start },
    ]);
    console.log(`live-status probe on "${soon.title}" ->`, JSON.stringify(st[soon.id] ?? null));
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
