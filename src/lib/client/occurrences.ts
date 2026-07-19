import { expandAll } from "@/lib/domain/recurrence";
import type { Occurrence, TrackEvent } from "@/lib/domain/types";
import type { ClientEvent } from "./types";

export function toTrack(events: ClientEvent[]): TrackEvent[] {
  return events.map((e) => ({ ...e, freq: e.freq as TrackEvent["freq"] }));
}

export interface Filter {
  categoryId?: string | "all";
  search?: string;
  favoriteTeams?: string[]; // lowercased names; when non-empty, keep only events whose title matches one
  hideWatched?: boolean;
}

export function occurrences(
  events: ClientEvent[],
  from: Date,
  to: Date,
  filter: Filter = {}
): Occurrence[] {
  const q = (filter.search || "").trim().toLowerCase();
  const cat = filter.categoryId && filter.categoryId !== "all" ? filter.categoryId : null;
  const fav = filter.favoriteTeams ?? [];
  const filtered = events.filter((e) => {
    if (cat && e.categoryId !== cat) return false;
    if (filter.hideWatched && e.watchedAt) return false;
    if (fav.length) {
      const t = e.title.toLowerCase();
      if (!fav.some((n) => t.includes(n))) return false;
    }
    if (q) {
      const hay = `${e.title} ${e.note ?? ""} ${e.location ?? ""} ${e.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return expandAll(toTrack(filtered), from, to);
}
