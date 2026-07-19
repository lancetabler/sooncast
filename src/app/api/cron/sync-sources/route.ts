import { prisma } from "@/lib/prisma";
import { ok, bad } from "@/lib/api";
import { runFollowImport } from "@/lib/import";
import { sendPush, pushReady } from "@/lib/push";

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

// Re-imports every followed source so schedules stay current, and pushes a
// summary when genuinely new fixtures appear. Run daily via an external pinger.
async function run(req: Request) {
  if (!authorized(req)) return bad("Unauthorized", 401);

  const users = await prisma.user.findMany({ include: { follows: true, subscriptions: true } });
  let totalFollows = 0;
  let totalAdded = 0;
  let failed = 0;

  for (const user of users) {
    let added = 0;
    for (const f of user.follows) {
      totalFollows++;
      try {
        const res = await runFollowImport(user.id, f);
        added += res.added;
      } catch {
        failed++;
      }
    }
    totalAdded += added;

    if (added > 0 && pushReady() && user.subscriptions.length) {
      const body = `${added} new event${added > 1 ? "s" : ""} added from the things you follow.`;
      for (const sub of user.subscriptions) {
        const status = await sendPush(sub, { title: "New on Radarr 📡", body, tag: `newevents-${user.id}-${Date.now()}` });
        if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }
    }
  }

  return ok({ ok: true, follows: totalFollows, added: totalAdded, failed });
}

export async function POST(req: Request) {
  return run(req);
}
export async function GET(req: Request) {
  return run(req);
}
