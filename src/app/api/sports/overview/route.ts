import { requireUser, isResponse, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSportsOverview } from "@/lib/sports";

export const dynamic = "force-dynamic";

// Standings + news for the leagues the user follows (ESPN team sports).
export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const follows = await prisma.follow.findMany({ where: { userId: user.id } });
  const teamSports = ["hockey", "basketball", "football", "baseball", "soccer"];
  const leagueRefs = follows
    .filter((f) => f.provider === "espn" && teamSports.includes(f.ref.split("/")[0]))
    .map((f) => f.ref.split("/teams/")[0]);
  const favorites = new Set(follows.filter((f) => f.ref.includes("/teams/")).map((f) => f.label));
  const includeF1 = follows.some((f) => f.provider === "jolpica" || (f.provider === "espn" && f.ref.startsWith("racing/f1")));

  if (!leagueRefs.length && !includeF1) return ok({ leagues: [] });
  const leagues = await getSportsOverview(leagueRefs, favorites, includeF1);
  return ok({ leagues });
}
