import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession } from "@/lib/auth";
import { ok, bad } from "@/lib/api";
import { rateLimit, clientId } from "@/lib/ratelimit";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: Request) {
  const rl = rateLimit(`login:${clientId(req)}`, 10, 15 * 60 * 1000);
  if (!rl.ok) return bad("Too many attempts. Try again in a few minutes.", 429);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return bad("Enter your email and password");
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return bad("Wrong email or password", 401);
  }
  await createSession(user.id);
  return ok({ id: user.id, email: user.email });
}
