import { requireUser, isResponse, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getLiveStatuses } from "@/lib/live";

export const dynamic = "force-dynamic";

// Returns live/final status + score for the requested ESPN-sourced events.
export async function GET(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const ids = (new URL(req.url).searchParams.get("ids") || "").split(",").filter(Boolean).slice(0, 60);
  if (!ids.length) return ok({});

  const events = await prisma.event.findMany({
    where: { id: { in: ids }, userId: user.id, sourceProvider: "espn" },
    include: { follow: true },
  });

  const statuses = await getLiveStatuses(
    events.map((e) => ({ eventId: e.id, sourceExtId: e.sourceExtId, followRef: e.follow?.ref ?? null, start: e.start }))
  );
  return ok(statuses);
}
