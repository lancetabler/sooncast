import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { serializeCategory } from "@/lib/serialize";

const schema = z.object({
  name: z.string().min(1).max(60).optional(),
  emoji: z.string().min(1).max(8).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const existing = await prisma.category.findFirst({ where: { id, userId: user.id } });
  if (!existing) return bad("Category not found", 404);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Invalid update");
  const updated = await prisma.category.update({ where: { id }, data: parsed.data });
  return ok(serializeCategory(updated));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const existing = await prisma.category.findFirst({ where: { id, userId: user.id } });
  if (!existing) return bad("Category not found", 404);
  // events keep existing but lose their category (onDelete: SetNull)
  await prisma.category.delete({ where: { id } });
  return ok({ ok: true });
}
