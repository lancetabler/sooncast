import type { Category, Event as DbEvent } from "@prisma/client";

export function parseIntArray(json: string): number[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

export interface ClientEvent {
  id: string;
  title: string;
  categoryId: string | null;
  start: string;
  allDay: boolean;
  durationMin: number;
  freq: string;
  until: string | null;
  location: string | null;
  url: string | null;
  note: string | null;
  imageUrl: string | null;
  reminders: number[];
  followId: string | null;
  sourceProvider: string | null;
  sourceLabel: string | null;
}

export function serializeEvent(e: DbEvent): ClientEvent {
  return {
    id: e.id,
    title: e.title,
    categoryId: e.categoryId,
    start: e.start.toISOString(),
    allDay: e.allDay,
    durationMin: e.durationMin,
    freq: e.freq,
    until: e.until ? e.until.toISOString() : null,
    location: e.location,
    url: e.url,
    note: e.note,
    imageUrl: e.imageUrl,
    reminders: parseIntArray(e.reminders),
    followId: e.followId,
    sourceProvider: e.sourceProvider,
    sourceLabel: e.sourceLabel,
  };
}

export interface ClientCategory {
  id: string;
  name: string;
  emoji: string;
  color: string;
  slug: string | null;
}
export function serializeCategory(c: Category): ClientCategory {
  return { id: c.id, name: c.name, emoji: c.emoji, color: c.color, slug: c.slug };
}
