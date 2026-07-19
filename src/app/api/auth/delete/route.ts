import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { verifyPassword, destroySession } from "@/lib/auth";

const schema = z.object({ password: z.string().min(1) });

// Permanently delete the account and everything owned by it (cascades via schema).
export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Password required");

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return bad("Not found", 404);
  const valid = await verifyPassword(parsed.data.password, dbUser.passwordHash);
  if (!valid) return bad("Password is incorrect", 403);

  await prisma.user.delete({ where: { id: user.id } });
  await destroySession();
  return ok({ ok: true });
}
