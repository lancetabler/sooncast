import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { leagueTeams } from "@/lib/sources/registry";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// List every team in a league so the user can follow their favorite.
export async function GET(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const rl = rateLimit(`teams:${user.id}`, 30, 60 * 1000);
  if (!rl.ok) return bad("Slow down a moment.", 429);
  const ref = new URL(req.url).searchParams.get("ref")?.trim() ?? "";
  if (!ref) return bad("Missing league ref");
  try {
    const items = await leagueTeams(ref);
    return ok({ items });
  } catch {
    return ok({ items: [] });
  }
}
