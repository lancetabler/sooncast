import { requireUser, isResponse, ok } from "@/lib/api";
import { unifiedSearch, featuredCatalog } from "@/lib/sources/registry";

export async function GET(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return ok({ items: featuredCatalog(), featured: true });
  try {
    const items = await unifiedSearch(q);
    return ok({ items, featured: false });
  } catch {
    return ok({ items: [], featured: false });
  }
}
