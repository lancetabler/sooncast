import { prisma } from "@/lib/prisma";
import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { serializeEvent } from "@/lib/serialize";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const MAX_SPAN_DAYS = 400;

/**
 * Events in an explicit date range. /api/state only carries a window around today so the
 * launch payload stays small; the calendar uses this to fill in months beyond that horizon.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const rl = rateLimit(`range:${user.id}`, 60, 60 * 1000);
  if (!rl.ok) return bad("Slow down a moment.", 429);

  const url = new URL(req.url);
  const from = new Date(url.searchParams.get("from") ?? "");
  const to = new Date(url.searchParams.get("to") ?? "");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return bad("Invalid range");
  if (to <= from) return bad("Invalid range");
  if (to.getTime() - from.getTime() > MAX_SPAN_DAYS * 86400_000) return bad("Range too large");

  const events = await prisma.event.findMany({
    where: { userId: user.id, start: { gte: from, lte: to } },
    orderBy: { start: "asc" },
  });
  return ok({ events: events.map(serializeEvent) });
}
