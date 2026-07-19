import { ok, bad } from "@/lib/api";
import { authorizeCron, recordCronRun } from "@/lib/cron";
import { runSync } from "@/lib/cronjobs";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Re-imports every followed source so schedules stay current, pushes a summary when new
// fixtures appear, and prunes stale past imports. Run daily (or let /api/cron/tick handle it).
async function run(req: Request) {
  if (!authorizeCron(req)) return bad("Unauthorized", 401);
  await recordCronRun("sync-sources");
  const r = await runSync();
  return ok({ ok: true, ...r });
}

export async function POST(req: Request) {
  return run(req);
}
export async function GET(req: Request) {
  return run(req);
}
