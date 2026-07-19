import { prisma } from "@/lib/prisma";
import { buildICS } from "@/lib/domain/ics";
import { parseIntArray } from "@/lib/serialize";
import type { TrackEvent } from "@/lib/domain/types";

type Ctx = { params: Promise<{ token: string }> };

// Public, unguessable feed. Subscribe to it in Apple/Google Calendar (webcal://)
// and it auto-refreshes — the reliable way to get closed-phone alerts on iOS.
export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  const user = await prisma.user.findUnique({ where: { feedToken: token } });
  if (!user) return new Response("Not found", { status: 404 });

  const events = await prisma.event.findMany({
    where: { userId: user.id },
    include: { category: true },
    orderBy: { start: "asc" },
  });

  const track: (TrackEvent & { emoji: string })[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    categoryId: e.categoryId,
    start: e.start.toISOString(),
    allDay: e.allDay,
    durationMin: e.durationMin,
    freq: e.freq as TrackEvent["freq"],
    until: e.until ? e.until.toISOString() : null,
    reminders: parseIntArray(e.reminders),
    location: e.location,
    url: e.url,
    note: e.note,
    imageUrl: e.imageUrl,
    emoji: e.category?.emoji ?? "",
  }));

  const ics = buildICS(track, {
    calName: "Radar",
    emojiPrefix: (ev) => (ev as TrackEvent & { emoji: string }).emoji,
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="radar.ics"`,
      "Cache-Control": "public, max-age=1800",
    },
  });
}
