/* Size of the /api/state payload the app downloads and caches on every refresh.
   Run from d:\Tracker:  npx tsx scripts/check-payload.ts   */
import { prisma } from "../src/lib/prisma";
import { loadState } from "../src/lib/state";

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  const total = await prisma.event.count();
  console.log(`events stored: ${total}`);
  for (const u of users) {
    const state = await loadState(u.id);
    if (!state) continue;
    const bytes = Buffer.byteLength(JSON.stringify(state));
    console.log(`${u.email}: ${state.events.length} events shipped -> ${(bytes / 1024).toFixed(0)} KB payload`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
