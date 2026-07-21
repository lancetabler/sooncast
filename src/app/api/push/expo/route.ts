import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, isResponse, ok, bad } from "@/lib/api";

// Native app registers its Expo push token here (authenticated via the Bearer JWT).
const schema = z.object({
  token: z.string().min(1).max(300),
  platform: z.string().max(20).optional(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Invalid push token");
  const { token, platform } = parsed.data;

  // Upsert by token so re-registering (and a token that migrates between users) is idempotent.
  await prisma.expoPushToken.upsert({
    where: { token },
    create: { userId: user.id, token, platform: platform ?? null },
    update: { userId: user.id, platform: platform ?? null },
  });
  return ok({ ok: true });
}
