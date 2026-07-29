import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { upcomingMovies } from "@/lib/sources/tmdb";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// Upcoming theatrical releases as individually followable items — the browse
// list behind the app's movie picker.
export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const rl = rateLimit(`movies:${user.id}`, 30, 60 * 1000);
  if (!rl.ok) return bad("Slow down a moment.", 429);
  try {
    const items = await upcomingMovies();
    return ok({ items });
  } catch {
    return ok({ items: [] });
  }
}
