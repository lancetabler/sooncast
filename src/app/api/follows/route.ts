import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { runFollowImport } from "@/lib/import";

const schema = z.object({
  provider: z.enum(["espn", "jolpica", "ics", "tmdb"]),
  ref: z.string().min(1).max(500),
  label: z.string().min(1).max(120),
  categorySlug: z.string().max(40).nullable().optional(),
});

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const follows = await prisma.follow.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  return ok(follows);
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid source");
  const d = parsed.data;

  const existing = await prisma.follow.findFirst({ where: { userId: user.id, provider: d.provider, ref: d.ref } });
  if (existing) return bad("You already follow this.", 409);

  const follow = await prisma.follow.create({
    data: { userId: user.id, provider: d.provider, ref: d.ref, label: d.label, categorySlug: d.categorySlug ?? null },
  });

  try {
    const result = await runFollowImport(user.id, follow);
    return ok({ follow, result }, 201);
  } catch (e) {
    // roll back the follow if the very first import fails hard
    await prisma.follow.delete({ where: { id: follow.id } }).catch(() => {});
    return bad("Couldn't load that source: " + (e as Error).message, 502);
  }
}
