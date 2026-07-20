import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { unifiedSearch, featuredCatalog } from "@/lib/sources/registry";
import { leagueBlurb } from "@/lib/domain/league-info";
import { rateLimit } from "@/lib/ratelimit";
import type { CatalogItem } from "@/lib/sources/types";

// Attach the "what is this?" blurb (keep any the item already carries, e.g. ICS feeds).
const withInfo = (items: CatalogItem[]): CatalogItem[] =>
  items.map((it) => ({ ...it, description: it.description ?? leagueBlurb(it.ref) }));

export async function GET(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const rl = rateLimit(`search:${user.id}`, 30, 60 * 1000);
  if (!rl.ok) return bad("Slow down a moment.", 429);
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return ok({ items: withInfo(featuredCatalog()), featured: true });
  try {
    const items = await unifiedSearch(q);
    return ok({ items: withInfo(items), featured: false });
  } catch {
    return ok({ items: [], featured: false });
  }
}
