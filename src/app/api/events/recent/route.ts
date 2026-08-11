import { prisma } from "@/lib/prisma";
import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { serializeEvent } from "@/lib/serialize";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const MAX_EVENTS = 300;
const DEFAULT_DAYS = 7;
const MAX_DAYS = 60;

/**
 * Events imported since a moment in time — what the "N new events added" push is actually about.
 *
 * Deliberately not filtered to the /api/state window: a sync usually lands a whole season at once,
 * and most of a newly published schedule sits well beyond the 75-day horizon that payload carries.
 * Answering "what got added?" from the state bundle would show a handful and hide the rest.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const rl = rateLimit(`recent:${user.id}`, 30, 60 * 1000);
  if (!rl.ok) return bad("Slow down a moment.", 429);

  const sinceParam = req.url ? new URL(req.url).searchParams.get("since") : null;
  const parsed = sinceParam ? Date.parse(sinceParam) : NaN;
  const floor = Date.now() - MAX_DAYS * 86400_000;
  // A missing or unparseable `since` (opened from the app rather than a push) falls back to a
  // week; anything older than MAX_DAYS is clamped so this can't become an unbounded table scan.
  const since = new Date(Number.isNaN(parsed) ? Date.now() - DEFAULT_DAYS * 86400_000 : Math.max(parsed, floor));

  // Imported only. The push says "from the things you follow", and an event the user typed in
  // themselves ten seconds ago is not news to them.
  const where = { userId: user.id, followId: { not: null }, createdAt: { gte: since } };

  const [events, total] = await Promise.all([
    prisma.event.findMany({ where, orderBy: { start: "asc" }, take: MAX_EVENTS }),
    prisma.event.count({ where }),
  ]);

  return ok({ events: events.map(serializeEvent), since: since.toISOString(), total });
}
