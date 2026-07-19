import { requireUser, isResponse, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSportsOverview } from "@/lib/sports";

export const dynamic = "force-dynamic";

// Standings + news for the leagues the user follows (ESPN team sports).
export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const follows = await prisma.follow.findMany({ where: { userId: user.id, provider: "espn" } });
  const leagueRefs = follows.map((f) => f.ref.split("/teams/")[0]);
  const favorites = new Set(follows.filter((f) => f.ref.includes("/teams/")).map((f) => f.label));

  if (!leagueRefs.length) return ok({ leagues: [] });
  const leagues = await getSportsOverview(leagueRefs, favorites);
  return ok({ leagues });
}
