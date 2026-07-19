import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { loadState } from "@/lib/state";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const state = await loadState(user.id);
  if (!state) return bad("Not found", 404);
  return ok(state);
}
