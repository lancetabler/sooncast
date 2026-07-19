import { requireUser, isResponse, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSportsOverview } from "@/lib/sports";

export const dynamic = "force-dynamic";

// Standings + news for the leagues the user follows (ESPN team sports).
export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const follows = await prisma.follow.findMany({ where: { userId: user.id } });
  // Every ESPN/MotoGP follow maps to a league section — team sports, racing, tennis, golf, MMA, cricket, …
  const leagueRefs = [
    ...follows.filter((f) => f.provider === "espn").map((f) => f.ref.split("/teams/")[0]),
    ...follows.filter((f) => f.provider === "motogp").map((f) => `motogp:${f.ref}`),
  ];
  const favorites = new Set(follows.filter((f) => f.ref.includes("/teams/")).map((f) => f.label));
  const includeF1 = follows.some((f) => f.provider === "jolpica" || (f.provider === "espn" && f.ref.startsWith("racing/f1")));

  if (!leagueRefs.length && !includeF1) return ok({ leagues: [] });
  const leagues = await getSportsOverview(leagueRefs, favorites, includeF1);
  return ok({ leagues });
}
