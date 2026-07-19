import { prisma } from "@/lib/prisma";
import { ok, bad } from "@/lib/api";
import { runFollowImport } from "@/lib/import";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const url = new URL(req.url);
  return (
    req.headers.get("x-cron-secret") === secret ||
    req.headers.get("authorization") === `Bearer ${secret}` ||
    url.searchParams.get("secret") === secret
  );
}

// Re-imports every followed source so schedules stay current (times moved, new
// fixtures added). Run daily via an external pinger.
async function run(req: Request) {
  if (!authorized(req)) return bad("Unauthorized", 401);

  const follows = await prisma.follow.findMany({ orderBy: { lastSync: "asc" } });
  let synced = 0;
  let added = 0;
  let failed = 0;

  for (const f of follows) {
    try {
      const res = await runFollowImport(f.userId, f);
      synced++;
      added += res.added;
    } catch {
      failed++;
    }
  }
  return ok({ ok: true, follows: follows.length, synced, added, failed });
}

export async function POST(req: Request) {
  return run(req);
}
export async function GET(req: Request) {
  return run(req);
}
