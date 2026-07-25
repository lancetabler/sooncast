import { parseICS } from "@/lib/domain/ics";
import { safeFetchText } from "@/lib/safe-fetch";
import { type NormalizedEvent, type SourceProvider } from "./types";

// Subscribe to any .ics / webcal schedule. Runs server-side, so CORS never applies.
// The URL is user-supplied, so it goes through the SSRF-guarded fetcher (public http(s) only).
export const icsfeed: SourceProvider = {
  id: "ics",
  async fetchEvents(ref: string): Promise<NormalizedEvent[]> {
    const text = await safeFetchText(ref);
    const parsed = parseICS(text);
    // only keep future-ish events (last 2 days onward) to avoid importing history
    const cutoff = Date.now() - 2 * 86400_000;
    return parsed
      .filter((p) => new Date(p.start).getTime() >= cutoff)
      .map((p) => ({
        extId: `ics-${p.uid || p.start + p.title}`,
        title: p.title,
        start: p.start,
        durationMin: p.durationMin,
        allDay: p.allDay,
        location: p.location,
        note: p.note,
      }));
  },
};
