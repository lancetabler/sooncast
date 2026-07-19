import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { serializeCategory } from "@/lib/serialize";

const schema = z.object({
  name: z.string().min(1).max(60),
  emoji: z.string().min(1).max(8).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const cats = await prisma.category.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  return ok(cats.map(serializeCategory));
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid category");

  const c = await prisma.category.create({
    data: {
      userId: user.id,
      name: parsed.data.name,
      emoji: parsed.data.emoji ?? "📌",
      color: parsed.data.color ?? "#5b8cff",
    },
  });
  return ok(serializeCategory(c), 201);
}
