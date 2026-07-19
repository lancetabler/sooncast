import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ok, bad } from "@/lib/api";
import { rateLimit, clientId } from "@/lib/ratelimit";
import { sendEmail, resetEmailHtml } from "@/lib/email";

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const rl = rateLimit(`forgot:${clientId(req)}`, 5, 60 * 60 * 1000);
  if (!rl.ok) return bad("Too many requests. Try again later.", 429);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Enter a valid email");
  const email = parsed.data.email.toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });
  // Always respond the same way so we don't reveal which emails exist.
  if (user) {
    const raw = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    await sendEmail({
      to: email,
      subject: "Reset your Cusp password",
      html: resetEmailHtml(`${appUrl}/reset?token=${raw}`),
    });
  }
  return ok({ ok: true });
}
