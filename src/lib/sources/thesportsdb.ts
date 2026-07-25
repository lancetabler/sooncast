// TheSportsDB (premium key) — covers the small televised series no big API carries:
// BTCC, DTM, WSBK, Formula E, NHRA, Supercross, darts, snooker, …
// ref = numeric league id. Crowd-sourced data: season strings can lag, so imports
// merge the premium next-events feed with the current AND next season schedules.
import { fetchJSON, type CatalogItem, type NormalizedEvent, type SourceProvider } from "./types";

const key = () => process.env.THESPORTSDB_API_KEY || "";
const base = () => `https://www.thesportsdb.com/api/v1/json/${key()}`;

export const tsdbConfigured = () => !!key();

// TheSportsDB `strSport` → our seeded category slug (see domain/categories.ts). Anything not
// listed falls back to "personal" so an obscure league still lands somewhere sensible.
const SPORT_TO_SLUG: Record<string, string> = {
  Soccer: "soccer",
  Basketball: "basketball",
  "American Football": "football",
  "Ice Hockey": "nhl",
  Baseball: "baseball",
  Motorsport: "racing",
  Fighting: "combat",
  Tennis: "tennis",
  Golf: "golf",
  Cricket: "cricket",
  Rugby: "rugby",
  "Australian Football": "afl",
  Darts: "darts",
  Snooker: "snooker",
  Athletics: "athletics",
  Volleyball: "volleyball",
  Lacrosse: "lacrosse",
  ESports: "games",
};

// The full TheSportsDB league list (~thousands) — fetched once, cached, then searched locally.
interface TsdbLeague { id: string; name: string; sport: string; alt: string }
let leaguesCache: { at: number; list: TsdbLeague[] } | null = null;

async function allLeagues(): Promise<TsdbLeague[]> {
  if (leaguesCache && Date.now() - leaguesCache.at < 24 * 3600_000) return leaguesCache.list;

  const data = await fetchJSON<{ leagues?: any[] }>(`${base()}/all_leagues.php`).catch(() => null);
  const list = (data?.leagues || [])
    .filter((l) => l?.idLeague && l?.strLeague)
    .map((l) => ({
      id: String(l.idLeague),
      name: String(l.strLeague),
      sport: String(l.strSport || ""),
      alt: String(l.strLeagueAlternate || ""),
    }));
  if (list.length) leaguesCache = { at: Date.now(), list };
  return list;
}

export interface TsdbLeagueInfo {
  description?: string;
  badge?: string;
  founded?: string;
  country?: string;
  website?: string;
  currentSeason?: string;
}

/** Rich league metadata for a profile view (description, badge, founding year, country, site). */
export async function tsdbLeagueInfo(id: string): Promise<TsdbLeagueInfo | null> {
  if (!key() || !/^\d+$/.test(id)) return null;
  const data = await fetchJSON<{ leagues?: Array<Record<string, string | null>> }>(`${base()}/lookupleague.php?id=${id}`).catch(() => null);
  const l = data?.leagues?.[0];
  if (!l) return null;
  const site = (l.strWebsite || "").trim();
  const formed = (l.intFormedYear || "").trim();
  return {
    description: (l.strDescriptionEN || "").trim() || undefined,
    badge: l.strBadge || l.strLogo || undefined,
    founded: formed && formed !== "0" ? formed : undefined,
    country: l.strCountry || undefined,
    website: site ? (site.startsWith("http") ? site : `https://${site}`) : undefined,
    currentSeason: (l.strCurrentSeason || "").trim() || undefined,
  };
}

/** "2025" → "2026"; "2025-2026" → "2026-2027" (season formats vary per league). */
export function bumpSeason(s: string): string | null {
  const m = s.trim().match(/^(\d{4})(?:-(\d{4}))?$/);
  if (!m) return null;
  const a = Number(m[1]) + 1;
  return m[2] ? `${a}-${Number(m[2]) + 1}` : String(a);
}

/** Resolve an event's start instant. strTimestamp is UTC; missing/midnight times mean "date only". */
export function tsdbStart(dateEvent?: string | null, strTime?: string | null, strTimestamp?: string | null): { start: string; allDay: boolean } | null {
  const time = (strTime ?? "").trim();
  const hasTime = /^\d{2}:\d{2}/.test(time) && time !== "00:00:00";
  if (strTimestamp && hasTime) {
    const iso = strTimestamp.includes("Z") || strTimestamp.includes("+") ? strTimestamp : `${strTimestamp.replace(" ", "T")}Z`;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return { start: d.toISOString(), allDay: false };
  }
  if (dateEvent && /^\d{4}-\d{2}-\d{2}$/.test(dateEvent)) {
    if (hasTime) {
      const d = new Date(`${dateEvent}T${time}Z`);
      if (!Number.isNaN(d.getTime())) return { start: d.toISOString(), allDay: false };
    }
    // date-only → noon UTC so it lands on the right calendar day everywhere
    return { start: `${dateEvent}T12:00:00.000Z`, allDay: true };
  }
  return null;
}

function normalize(e: any): NormalizedEvent | null {
  if (!e?.idEvent || !e?.strEvent) return null;
  const when = tsdbStart(e.dateEvent, e.strTime, e.strTimestamp);
  if (!when) return null;
  const location = [e.strVenue, e.strCity].filter(Boolean).join(", ") || e.strCountry || undefined;
  return {
    extId: `tsdb-${e.idEvent}`,
    title: e.strEvent,
    start: when.start,
    allDay: when.allDay,
    durationMin: 120,
    location,
    note: e.strTVStation ? `📺 ${e.strTVStation}` : undefined,
    imageUrl: e.strThumb || e.strSquare || undefined,
  };
}

export const thesportsdb: SourceProvider = {
  id: "thesportsdb",
  async fetchEvents(ref: string): Promise<NormalizedEvent[]> {
    if (!key()) throw new Error("TheSportsDB key not configured");
    if (!/^\d+$/.test(ref)) throw new Error(`Invalid TheSportsDB league id: ${ref}`);

    const [nextData, leagueData] = await Promise.all([
      fetchJSON<any>(`${base()}/eventsnextleague.php?id=${ref}`).catch(() => null),
      fetchJSON<any>(`${base()}/lookupleague.php?id=${ref}`).catch(() => null),
    ]);

    const seasons: string[] = [];
    const current = leagueData?.leagues?.[0]?.strCurrentSeason?.trim();
    if (current) {
      seasons.push(current);
      const next = bumpSeason(current);
      if (next) seasons.push(next);
    }
    const seasonLists = await Promise.all(
      seasons.map((s) =>
        fetchJSON<any>(`${base()}/eventsseason.php?id=${ref}&s=${encodeURIComponent(s)}`)
          .then((d) => d?.events || [])
          .catch(() => [])
      )
    );

    const merged = new Map<string, any>();
    for (const e of [...(nextData?.events || []), ...seasonLists.flat()]) {
      if (e?.idEvent) merged.set(String(e.idEvent), e);
    }

    const cutoff = Date.now() - 2 * 86400_000;
    return [...merged.values()]
      .map(normalize)
      .filter((n): n is NormalizedEvent => !!n)
      .filter((n) => new Date(n.start).getTime() >= cutoff);
  },

  // Search every TheSportsDB league by name (exact → prefix → substring → alternate name).
  async search(query: string): Promise<CatalogItem[]> {
    if (!key()) return [];
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const scored: { l: TsdbLeague; score: number }[] = [];
    for (const l of await allLeagues()) {
      const name = l.name.toLowerCase();
      let score = -1;
      if (name === q) score = 0;
      else if (name.startsWith(q)) score = 1;
      else if (name.includes(q)) score = 2;
      else if (l.alt.toLowerCase().includes(q)) score = 3;
      if (score >= 0) scored.push({ l, score });
    }
    scored.sort((a, b) => a.score - b.score || a.l.name.localeCompare(b.l.name));

    return scored.slice(0, 15).map(
      ({ l }): CatalogItem => ({
        provider: "thesportsdb",
        ref: l.id,
        label: l.name,
        sublabel: `${l.sport} · community data`,
        categorySlug: SPORT_TO_SLUG[l.sport] ?? "personal",
      })
    );
  },
};
