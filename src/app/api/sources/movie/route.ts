import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { movieDetail } from "@/lib/sources/tmdb";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** Synopsis, cast and trailer for one film — enough to decide whether to track it. */
export async function GET(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const rl = rateLimit(`movie:${user.id}`, 60, 60 * 1000);
  if (!rl.ok) return bad("Slow down a moment.", 429);

  const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
  if (!/^\d+$/.test(id)) return bad("Invalid movie id");

  const detail = await movieDetail(id).catch(() => null);
  if (!detail) return bad("Not found", 404);
  return ok({ movie: detail });
}
