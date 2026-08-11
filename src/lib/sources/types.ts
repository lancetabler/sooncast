// A normalized event coming from any external source, before it becomes a DB Event.
export interface NormalizedEvent {
  extId: string; // stable id for upsert (provider-scoped)
  title: string;
  start: string; // ISO instant
  durationMin: number;
  allDay?: boolean;
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
  description?: string; // plain-English "what is this" blurb (shown via the ⓘ button)
}

export interface SourceProvider {
  id: string;
  // Fetch upcoming events for a followed ref.
  fetchEvents(ref: string, params?: Record<string, unknown>): Promise<NormalizedEvent[]>;
  // Optional free-text search returning followable catalog items.
  search?(query: string): Promise<CatalogItem[]>;
}

/**
 * ESPN sits behind Akamai, which answers 403 "Access Denied" to any request from our
 * servers that carries a custom User-Agent (a browser-like UA is refused too) while
 * serving a plain, header-less request normally. Identifying ourselves therefore has to
 * be skipped for these hosts or every schedule, score and standings call fails in
 * production. Verified against site.api / site.web.api / cdn.espn.com from the deployed
 * region — see git history for the probe.
 */
function needsBareRequest(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("espn.com");
  } catch {
    return false;
  }
}

/** revalidateSec 0 = live data, never cached; otherwise Next caches the fetch briefly. */
export async function fetchJSON<T = unknown>(url: string, ms = 12000, revalidateSec = 900): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      ...(needsBareRequest(url) ? {} : { headers: { "User-Agent": "SooncastTracker/1.0", Accept: "application/json" } }),
      ...(revalidateSec === 0 ? { cache: "no-store" as const } : { next: { revalidate: revalidateSec } }),
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
      headers: { "User-Agent": "SooncastTracker/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}
