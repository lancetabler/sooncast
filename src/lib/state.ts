import "server-only";
import { prisma } from "@/lib/prisma";
import { serializeEvent, serializeCategory, parseIntArray, type ClientEvent, type ClientCategory } from "@/lib/serialize";

export interface ClientFollow {
  id: string;
  provider: string;
  ref: string;
  label: string;
  categorySlug: string | null;
  lastSync: string | null;
  muted: boolean;
  scoreAlerts: boolean;
  count: number;
}
export interface ClientUser {
  id: string;
  email: string;
  displayName: string | null;
  timezone: string;
  quietStart: number | null;
  quietEnd: number | null;
  defaultReminders: number[];
  feedUrl: string;
}
export interface StateBundle {
  user: ClientUser;
  categories: ClientCategory[];
  events: ClientEvent[];
  follows: ClientFollow[];
}

// Keep the client payload lean: send upcoming + recent past, plus anything watched
// (for profile stats) or recurring (any base date can recur forward). Old imported
// one-offs are dropped from the payload — they're pruned server-side over time too.
const STATE_WINDOW_DAYS = 45;

export async function loadState(userId: string): Promise<StateBundle | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const cutoff = new Date(Date.now() - STATE_WINDOW_DAYS * 86400_000);
  const [categories, events, follows, followCounts] = await Promise.all([
    prisma.category.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.event.findMany({
      where: {
        userId,
        OR: [{ start: { gte: cutoff } }, { watchedAt: { not: null } }, { freq: { not: "none" } }],
      },
      orderBy: { start: "asc" },
    }),
    prisma.follow.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.event.groupBy({ by: ["followId"], where: { userId, followId: { not: null } }, _count: true }),
  ]);

  // Accurate per-follow totals (all events, not just the windowed payload).
  const countByFollow = new Map(followCounts.map((r) => [r.followId, r._count]));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      timezone: user.timezone,
      quietStart: user.quietStart,
      quietEnd: user.quietEnd,
      defaultReminders: parseIntArray(user.defaultReminders),
      feedUrl: `${appUrl}/api/feed/${user.feedToken}`,
    },
    categories: categories.map(serializeCategory),
    events: events.map(serializeEvent),
    follows: follows.map((f) => ({
      id: f.id,
      provider: f.provider,
      ref: f.ref,
      label: f.label,
      categorySlug: f.categorySlug,
      lastSync: f.lastSync ? f.lastSync.toISOString() : null,
      muted: f.muted,
      scoreAlerts: f.scoreAlerts,
      count: countByFollow.get(f.id) ?? 0,
    })),
  };
}
