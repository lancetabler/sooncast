// A normalized event coming from any external source, before it becomes a DB Event.
export interface NormalizedEvent {
  extId: string; // stable id for upsert (provider-scoped)
  title: string;
  start: string; // ISO instant
  durationMin: number;
  location?: string;
  note?: string;
  url?: string;
  imageUrl?: string;
}

// A thing the user can search for and follow (a league, series, team, brand...).
export interface CatalogItem {
  provider: string;
  ref: string; // provider-specific identifier
  label: string;
  sublabel?: string;
  categorySlug: string;
  imageUrl?: string;
  browse?: boolean; // league whose teams can be browsed for a favorite-team follow
}

export interface SourceProvider {
  id: string;
  // Fetch upcoming events for a followed ref.
  fetchEvents(ref: string, params?: Record<string, unknown>): Promise<NormalizedEvent[]>;
  // Optional free-text search returning followable catalog items.
  search?(query: string): Promise<CatalogItem[]>;
}

export async function fetchJSON<T = unknown>(url: string, ms = 12000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "RadarrTracker/1.0", Accept: "application/json" },
      // sources change often; keep them fresh but let Next cache briefly
      next: { revalidate: 900 },
    });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchText(url: string, ms = 12000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url.replace(/^webcal:/i, "https:"), {
      signal: ctrl.signal,
      headers: { "User-Agent": "RadarrTracker/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}
