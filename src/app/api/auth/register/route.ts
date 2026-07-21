import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSession } from "@/lib/auth";
import { SEED_CATEGORIES } from "@/lib/domain/categories";
import { ok, bad } from "@/lib/api";
import { rateLimit, clientId } from "@/lib/ratelimit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().max(60).optional(),
  timezone: z.string().max(64).optional(),
});

export async function POST(req: Request) {
  const rl = rateLimit(`register:${clientId(req)}`, 5, 60 * 60 * 1000);
  if (!rl.ok) return bad("Too many sign-up attempts. Try again later.", 429);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid input");
  const { email, password, displayName, timezone } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return bad("An account with that email already exists", 409);

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
      displayName: displayName || null,
      timezone: timezone || "UTC",
      categories: {
        create: SEED_CATEGORIES.map((c) => ({ slug: c.slug, name: c.name, emoji: c.emoji, color: c.color })),
      },
    },
  });

  const token = await createSession(user.id);
  return ok({ id: user.id, email: user.email, token }, 201);
}
