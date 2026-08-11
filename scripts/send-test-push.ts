/* Send one test push to every registered device via the production Expo path.
   Run from d:\Tracker:  npx tsx scripts/send-test-push.ts   */
import { prisma } from "../src/lib/prisma";
import { sendExpo } from "../src/lib/expo-push";

async function main() {
  const tokens = await prisma.expoPushToken.findMany();
  console.log(`${tokens.length} registered device(s)`);
  if (!tokens.length) return;
  const sent = await sendExpo(tokens, {
    title: "Sooncast test 📡",
    body: "If you can read this, push delivery works end to end.",
  });
  console.log(`delivered to ${sent} device(s)`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
