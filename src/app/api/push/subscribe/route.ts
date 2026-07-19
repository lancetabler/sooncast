import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, isResponse, ok, bad } from "@/lib/api";

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Invalid subscription");
  const { endpoint, keys } = parsed.data;

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth },
    create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });
  return ok({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  if (endpoint) await prisma.pushSubscription.deleteMany({ where: { userId: user.id, endpoint } });
  return ok({ ok: true });
}
