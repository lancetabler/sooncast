import { z } from "zod";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ok, bad } from "@/lib/api";
import { hashPassword, createSession } from "@/lib/auth";
import { rateLimit, clientId } from "@/lib/ratelimit";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: Request) {
  const rl = rateLimit(`reset:${clientId(req)}`, 10, 15 * 60 * 1000);
  if (!rl.ok) return bad("Too many attempts. Try again later.", 429);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid request");

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return bad("This reset link is invalid or has expired. Request a new one.", 400);
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(parsed.data.password) } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // invalidate any other outstanding tokens for this user
    prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  await createSession(record.userId);
  return ok({ ok: true });
}
