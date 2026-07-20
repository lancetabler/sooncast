import { prisma } from "@/lib/prisma";
import { ok, bad } from "@/lib/api";
import { authorizeCron, recordCronRun } from "@/lib/cron";
import { runReminders, runDigest, runSync } from "@/lib/cronjobs";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ONE endpoint to rule them all. Point a single every-minute pinger here and it drives:
//   • reminders + live score alerts  — every call
//   • daily digest                   — once, in each user's 7–10am window
//   • source re-sync + prune         — at most once every ~6 hours
// So you maintain exactly one cron job instead of three.
const SYNC_EVERY_MS = 6 * 3600_000;

async function run(req: Request) {
  if (!authorizeCron(req)) return bad("Unauthorized", 401);
  await recordCronRun("reminders");

  const reminders = await runReminders();
  const digest = await runDigest({ force: false });
  // Reflect a real digest send in the health panel (tick drives the digest, so otherwise its
  // CronRun row would stay blank under the recommended single-pinger setup).
  if (digest.sent > 0) await recordCronRun("digest");

  let sync: Awaited<ReturnType<typeof runSync>> | null = null;
  const lastSync = await prisma.cronRun.findUnique({ where: { name: "sync-sources" } }).catch(() => null);
  if (!lastSync || Date.now() - lastSync.at.getTime() >= SYNC_EVERY_MS) {
    await recordCronRun("sync-sources");
    sync = await runSync();
  }

  return ok({ ok: true, reminders, digest, sync });
}

export async function POST(req: Request) {
  return run(req);
}
export async function GET(req: Request) {
  return run(req);
}
