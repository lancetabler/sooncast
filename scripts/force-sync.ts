/* Clear the 6-hour sync gate so the next /api/cron/tick performs a full source sync.
   Run from d:\Tracker:  npx tsx scripts/force-sync.ts   */
import { prisma } from "../src/lib/prisma";

async function main() {
  const old = new Date(Date.now() - 24 * 3600_000);
  await prisma.cronRun.upsert({
    where: { name: "sync-sources" },
    create: { name: "sync-sources", at: old },
    update: { at: old },
  });
  console.log("sync gate cleared — next tick will run a full sync");
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
