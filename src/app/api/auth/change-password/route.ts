import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { verifyPassword, hashPassword } from "@/lib/auth";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid input");

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return bad("Not found", 404);
  const valid = await verifyPassword(parsed.data.currentPassword, dbUser.passwordHash);
  if (!valid) return bad("Current password is incorrect", 403);

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.newPassword) } });
  return ok({ ok: true });
}
