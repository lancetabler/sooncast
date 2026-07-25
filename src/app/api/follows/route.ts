import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { runFollowImport } from "@/lib/import";

const schema = z.object({
  provider: z.enum(["espn", "jolpica", "motogp", "thesportsdb", "ics", "tmdb"]),
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
  // Each follow triggers an outbound fetch — bound how fast one account can drive that.
  const rl = rateLimit(`follow:${user.id}`, 20, 60 * 1000);
  if (!rl.ok) return bad("Slow down a moment.", 429);

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
    // roll back the follow if the very first import fails hard. Keep the message generic for
    // user-supplied URLs so the response can't be used to probe internal infrastructure.
    await prisma.follow.delete({ where: { id: follow.id } }).catch(() => {});
    const msg = d.provider === "ics" ? "Couldn't load that feed." : "Couldn't load that source: " + (e as Error).message;
    return bad(msg, 502);
  }
}
