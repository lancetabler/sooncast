import { ok, bad } from "@/lib/api";
import { authorizeCron, recordCronRun } from "@/lib/cron";
import { runReminders } from "@/lib/cronjobs";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Per-minute reminders + live score alerts. (Or use /api/cron/tick to drive everything from one pinger.)
async function run(req: Request) {
  if (!authorizeCron(req)) return bad("Unauthorized", 401);
  await recordCronRun("reminders");
  const r = await runReminders();
  return ok({ ok: true, ...r });
}

export async function POST(req: Request) {
  return run(req);
}
export async function GET(req: Request) {
  return run(req);
}
