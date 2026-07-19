import type { Follow } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchFromSource } from "@/lib/sources/registry";
import { SEED_CATEGORIES } from "@/lib/domain/categories";
import { parseIntArray } from "@/lib/serialize";

/** Ensure a category exists for the given slug; create it from the seed set if missing. */
export async function ensureCategory(userId: string, slug: string | null): Promise<string | null> {
  if (!slug) return null;
  const existing = await prisma.category.findFirst({ where: { userId, slug } });
  if (existing) return existing.id;
  const seed = SEED_CATEGORIES.find((s) => s.slug === slug);
  const created = await prisma.category.create({
    data: {
      userId,
      slug,
      name: seed?.name ?? slug,
      emoji: seed?.emoji ?? "📌",
      color: seed?.color ?? "#5b8cff",
    },
  });
  return created.id;
}

export interface ImportResult {
  added: number;
  updated: number;
  skippedForLimit: number;
}

/** Fetch a follow's source and upsert its events for the user. */
export async function runFollowImport(
  userId: string,
  follow: Pick<Follow, "id" | "provider" | "ref" | "label" | "categorySlug">
): Promise<ImportResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  const defaultReminders = parseIntArray(user.defaultReminders);

  const normalized = await fetchFromSource(follow.provider, follow.ref);
  const categoryId = await ensureCategory(userId, follow.categorySlug);

  const result: ImportResult = { added: 0, updated: 0, skippedForLimit: 0 };

  for (const n of normalized) {
    const sourceExtId = `${follow.provider}:${n.extId}`;
    const existing = await prisma.event.findFirst({ where: { userId, sourceExtId } });
    if (existing) {
      await prisma.event.update({
        where: { id: existing.id },
        data: {
          title: n.title,
          start: new Date(n.start),
          durationMin: n.durationMin,
          location: n.location ?? null,
          note: n.note ?? null,
          url: n.url ?? null,
          imageUrl: n.imageUrl ?? null,
          sourceLabel: follow.label,
          followId: follow.id,
          categoryId: existing.categoryId ?? categoryId,
        },
      });
      result.updated++;
    } else {
      await prisma.event.create({
        data: {
          userId,
          categoryId,
          title: n.title,
          start: new Date(n.start),
          durationMin: n.durationMin,
          location: n.location ?? null,
          note: n.note ?? null,
          url: n.url ?? null,
          imageUrl: n.imageUrl ?? null,
          reminders: JSON.stringify(defaultReminders),
          followId: follow.id,
          sourceProvider: follow.provider,
          sourceExtId,
          sourceLabel: follow.label,
        },
      });
      result.added++;
    }
  }

  await prisma.follow.update({ where: { id: follow.id }, data: { lastSync: new Date() } });
  return result;
}
