import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { getLeagueProfile } from "@/lib/sports";
import { leagueBlurb } from "@/lib/domain/league-info";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// Deep-dive profile for one league/series: description, standings, results, past champions.
export async function GET(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const rl = rateLimit(`league:${user.id}`, 40, 60 * 1000);
  if (!rl.ok) return bad("Slow down a moment.", 429);

  const url = new URL(req.url);
  const provider = url.searchParams.get("provider")?.trim() ?? "";
  const ref = url.searchParams.get("ref")?.trim() ?? "";
  if (!provider || !ref) return bad("Missing provider or ref");

  try {
    const profile = await getLeagueProfile(provider, ref);
    // Fall back to the static blurb when the source has no description of its own.
    if (!profile.description) profile.description = leagueBlurb(ref);
    return ok(profile);
  } catch {
    return ok({ label: "", meta: [], standingsTitle: "Standings", standings: [], results: [], champions: [], description: leagueBlurb(ref) });
  }
}
