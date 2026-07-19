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

export async function loadState(userId: string): Promise<StateBundle | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const [categories, events, follows] = await Promise.all([
    prisma.category.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.event.findMany({ where: { userId }, orderBy: { start: "asc" } }),
    prisma.follow.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
  ]);

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
      count: events.filter((e) => e.followId === f.id).length,
    })),
  };
}
