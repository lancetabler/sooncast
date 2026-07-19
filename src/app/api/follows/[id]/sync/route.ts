import { prisma } from "@/lib/prisma";
import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { runFollowImport } from "@/lib/import";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const follow = await prisma.follow.findFirst({ where: { id, userId: user.id } });
  if (!follow) return bad("Not found", 404);
  try {
    const result = await runFollowImport(user.id, follow);
    return ok({ result });
  } catch (e) {
    return bad("Sync failed: " + (e as Error).message, 502);
  }
}
