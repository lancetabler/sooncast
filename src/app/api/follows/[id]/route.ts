import { prisma } from "@/lib/prisma";
import { requireUser, isResponse, ok, bad } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const follow = await prisma.follow.findFirst({ where: { id, userId: user.id } });
  if (!follow) return bad("Not found", 404);
  // events cascade-delete via the Follow relation
  await prisma.follow.delete({ where: { id } });
  return ok({ ok: true });
}
