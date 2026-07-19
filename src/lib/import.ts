import type { Follow, Prisma } from "@prisma/client";
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
}

/** Fetch a follow's source and upsert its events for the user. */
export async function runFollowImport(
  userId: string,
  follow: Pick<Follow, "id" | "provider" | "ref" | "label" | "categorySlug">
): Promise<ImportResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  const defaultReminders = parseIntArray(user.defaultReminders);

  const normalizedRaw = await fetchFromSource(follow.provider, follow.ref);
  // De-dupe within this fetch so a single import never inserts the same game twice.
  const seenExt = new Set<string>();
  const normalized = normalizedRaw.filter((n) => {
    if (seenExt.has(n.extId)) return false;
    seenExt.add(n.extId);
    return true;
  });

  const categoryId = await ensureCategory(userId, follow.categorySlug);
  const result: ImportResult = { added: 0, updated: 0 };

  if (normalized.length) {
    // One query to load everything that already exists, instead of one per game.
    const extIds = normalized.map((n) => `${follow.provider}:${n.extId}`);
    const existing = await prisma.event.findMany({ where: { userId, sourceExtId: { in: extIds } } });
    const byExt = new Map(existing.map((e) => [e.sourceExtId!, e]));

    const toCreate: Prisma.EventCreateManyInput[] = [];
    const updates: Prisma.PrismaPromise<unknown>[] = [];

    for (const n of normalized) {
      const sourceExtId = `${follow.provider}:${n.extId}`;
      const start = new Date(n.start);
      const ex = byExt.get(sourceExtId);
      if (!ex) {
        toCreate.push({
          userId,
          categoryId,
          title: n.title,
          start,
          allDay: n.allDay ?? false,
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
        });
      } else {
        // Only write when something actually changed — keeps re-syncs cheap.
        const changed =
          ex.title !== n.title ||
          ex.start.getTime() !== start.getTime() ||
          ex.allDay !== (n.allDay ?? false) ||
          (ex.location ?? null) !== (n.location ?? null) ||
          (ex.url ?? null) !== (n.url ?? null) ||
          (ex.note ?? null) !== (n.note ?? null) ||
          (ex.imageUrl ?? null) !== (n.imageUrl ?? null);
        if (changed) {
          updates.push(
            prisma.event.update({
              where: { id: ex.id },
              data: {
                title: n.title,
                start,
                allDay: n.allDay ?? false,
                durationMin: n.durationMin,
                location: n.location ?? null,
                note: n.note ?? null,
                url: n.url ?? null,
                imageUrl: n.imageUrl ?? null,
                // keep the original owner so unfollowing an overlapping source doesn't delete shared games
                sourceLabel: ex.followId ? ex.sourceLabel : follow.label,
                followId: ex.followId ?? follow.id,
                categoryId: ex.categoryId ?? categoryId,
              },
            })
          );
        }
      }
    }

    if (toCreate.length) {
      const r = await prisma.event.createMany({ data: toCreate, skipDuplicates: true });
      result.added = r.count;
    }
    // Batch updates in chunks so we never fire hundreds of individual round-trips.
    const CHUNK = 50;
    for (let i = 0; i < updates.length; i += CHUNK) {
      await prisma.$transaction(updates.slice(i, i + CHUNK));
    }
    result.updated = updates.length;
  }

  await prisma.follow.update({ where: { id: follow.id }, data: { lastSync: new Date() } });
  return result;
}
