import { prisma } from "@/lib/prisma";
import { requireUser, isResponse, ok, bad } from "@/lib/api";
import { parseIntArray } from "@/lib/serialize";

export const dynamic = "force-dynamic";

// Full data export (download a JSON backup).
export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const [dbUser, categories, events, follows] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id } }),
    prisma.category.findMany({ where: { userId: user.id } }),
    prisma.event.findMany({ where: { userId: user.id }, include: { category: true } }),
    prisma.follow.findMany({ where: { userId: user.id } }),
  ]);

  return ok({
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: {
      timezone: dbUser?.timezone,
      defaultReminders: parseIntArray(dbUser?.defaultReminders ?? "[]"),
      quietStart: dbUser?.quietStart ?? null,
      quietEnd: dbUser?.quietEnd ?? null,
    },
    categories: categories.map((c) => ({ name: c.name, emoji: c.emoji, color: c.color, slug: c.slug })),
    events: events.map((e) => ({
      title: e.title,
      start: e.start.toISOString(),
      allDay: e.allDay,
      durationMin: e.durationMin,
      freq: e.freq,
      until: e.until ? e.until.toISOString() : null,
      location: e.location,
      url: e.url,
      note: e.note,
      reminders: parseIntArray(e.reminders),
      categoryName: e.category?.name ?? null,
    })),
    follows: follows.map((f) => ({ provider: f.provider, ref: f.ref, label: f.label, categorySlug: f.categorySlug })),
  });
}

// Restore (additive merge — won't duplicate events with the same title + start).
export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const data = await req.json().catch(() => null);
  if (!data || !Array.isArray(data.events)) return bad("Not a valid backup file");

  // categories by name -> id (create missing)
  const existingCats = await prisma.category.findMany({ where: { userId: user.id } });
  const catByName = new Map(existingCats.map((c) => [c.name, c.id]));
  for (const c of data.categories ?? []) {
    if (c?.name && !catByName.has(c.name)) {
      const created = await prisma.category.create({
        data: { userId: user.id, name: c.name, emoji: c.emoji || "📌", color: c.color || "#5b8cff", slug: c.slug || null },
      });
      catByName.set(c.name, created.id);
    }
  }

  const existing = await prisma.event.findMany({ where: { userId: user.id }, select: { title: true, start: true } });
  const seen = new Set(existing.map((e) => `${e.title}@${e.start.toISOString()}`));

  let addedEvents = 0;
  for (const e of data.events) {
    if (!e?.title || !e?.start) continue;
    const startISO = new Date(e.start).toISOString();
    if (seen.has(`${e.title}@${startISO}`)) continue;
    await prisma.event.create({
      data: {
        userId: user.id,
        title: e.title,
        start: new Date(startISO),
        allDay: !!e.allDay,
        durationMin: e.durationMin ?? 120,
        freq: e.freq ?? "none",
        until: e.until ? new Date(e.until) : null,
        location: e.location ?? null,
        url: e.url ?? null,
        note: e.note ?? null,
        reminders: JSON.stringify(Array.isArray(e.reminders) ? e.reminders : []),
        categoryId: e.categoryName ? catByName.get(e.categoryName) ?? null : null,
      },
    });
    seen.add(`${e.title}@${startISO}`);
    addedEvents++;
  }

  // follows (skip existing)
  let addedFollows = 0;
  for (const f of data.follows ?? []) {
    if (!f?.provider || !f?.ref) continue;
    const exists = await prisma.follow.findFirst({ where: { userId: user.id, provider: f.provider, ref: f.ref } });
    if (exists) continue;
    await prisma.follow.create({
      data: { userId: user.id, provider: f.provider, ref: f.ref, label: f.label || "Source", categorySlug: f.categorySlug ?? null },
    });
    addedFollows++;
  }

  return ok({ addedEvents, addedFollows });
}
