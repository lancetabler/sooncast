import { ok, bad } from "@/lib/api";
import { authorizeCron, recordCronRun } from "@/lib/cron";
import { runDigest } from "@/lib/cronjobs";

export const dynamic = "force-dynamic";

// A once-a-day "here's your day" summary. Point a daily pinger here at your preferred
// morning time (force send), or let /api/cron/tick fire it in each user's own morning.
async function run(req: Request) {
  if (!authorizeCron(req)) return bad("Unauthorized", 401);
  await recordCronRun("digest");
  const r = await runDigest({ force: true });
  return ok({ ok: true, ...r });
}

export async function POST(req: Request) {
  return run(req);
}
export async function GET(req: Request) {
  return run(req);
}
