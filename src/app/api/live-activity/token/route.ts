import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const schema = z.object({
  eventId: z.string().min(1).max(64),
  // ActivityKit tokens are lowercase hex, ~64-160 chars depending on iOS version.
  token: z.string().regex(/^[0-9a-fA-F]{32,256}$/),
});

/** Register a running Live Activity so the server can update it while the app is closed. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const rl = rateLimit(`la:${user.id}`, 60, 60 * 1000);
  if (!rl.ok) return bad("Slow down a moment.", 429);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Invalid token");
  const { eventId, token } = parsed.data;

  // The event must be the caller's — otherwise anyone could attach an Activity to any id.
  const event = await prisma.event.findFirst({ where: { id: eventId, userId: user.id }, select: { id: true } });
  if (!event) return bad("Not found", 404);

  await prisma.liveActivityToken.upsert({
    where: { token },
    create: { userId: user.id, eventId, token },
    update: { eventId, userId: user.id },
  });
  return ok({ ok: true });
}

/** Called when the app ends an Activity locally, so we stop pushing to a dead token. */
export async function DELETE(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) return bad("Missing token");
  await prisma.liveActivityToken.deleteMany({ where: { userId: user.id, token } });
  return ok({ ok: true });
}
