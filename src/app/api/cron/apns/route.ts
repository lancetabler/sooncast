import { prisma } from "@/lib/prisma";
import { ok, bad } from "@/lib/api";
import { authorizeCron } from "@/lib/cron";
import { apnsHealth, apnsProbe } from "@/lib/apns";

export const dynamic = "force-dynamic";

/**
 * Are the Live Activity push credentials working? A .p8 is downloadable exactly once, so a
 * wrong or truncated key is a normal mistake — and its only other symptom is Lock Screens
 * that silently never update during a game.
 */
export async function GET(req: Request) {
  if (!authorizeCron(req)) return bad("Unauthorized", 401);
  const health = apnsHealth();
  const registered = await prisma.liveActivityToken.count();
  // Local signing isn't proof — ask Apple unless explicitly skipped.
  const probe = health.signs && new URL(req.url).searchParams.get("probe") !== "0" ? await apnsProbe() : null;
  return ok({
    ...health,
    appleAccepts: probe ? probe.ok : null,
    appleSaid: probe ? `${probe.status} ${probe.reason}` : null,
    registeredActivities: registered,
    note: probe?.ok
      ? "Live Activities will update from the server during games."
      : "Live Activities still update while the app is open; server-driven updates are off.",
  });
}
