import { espn, ESPN_CATALOG } from "./espn";
import { jolpica } from "./jolpica";
import { thesportsdb } from "./thesportsdb";
import { icsfeed } from "./icsfeed";
import { tmdb } from "./tmdb";
import type { CatalogItem, NormalizedEvent, SourceProvider } from "./types";

export { leagueTeams } from "./espn";

const PROVIDERS: Record<string, SourceProvider> = {
  espn,
  jolpica,
  thesportsdb,
  ics: icsfeed,
  tmdb,
};

export function getProvider(id: string): SourceProvider | null {
  return PROVIDERS[id] || null;
}

export async function fetchFromSource(provider: string, ref: string): Promise<NormalizedEvent[]> {
  const p = getProvider(provider);
  if (!p) throw new Error(`Unknown source: ${provider}`);
  return p.fetchEvents(ref);
}

// Featured, one-tap follows shown in Discover before the user searches.
// Public .ics calendar feeds (community-maintained) for series without a clean API.
const ICS_FEEDS: CatalogItem[] = [
  { provider: "ics", ref: "https://calendar.google.com/calendar/ical/njulhksvo83qeoruc3nhend9js%40group.calendar.google.com/public/basic.ics", label: "IMSA WeatherTech", sublabel: "SportsCar Championship — full season", categorySlug: "imsa" },
  { provider: "ics", ref: "https://calendar.google.com/calendar/ical/61jccgg4rshh1temqk0dj4lens%40group.calendar.google.com/public/basic.ics", label: "FIA WEC", sublabel: "World Endurance Championship + Le Mans", categorySlug: "wec" },
];

// Follow a whole league's season. Pick a team from any of these to just track your club.
const LEAGUE_FOLLOWS: CatalogItem[] = [
  { provider: "espn", ref: "football/nfl", label: "NFL", sublabel: "Full season — pick your team", categorySlug: "football", browse: true },
  { provider: "espn", ref: "basketball/nba", label: "NBA", sublabel: "Full season — pick your team", categorySlug: "basketball", browse: true },
  { provider: "espn", ref: "baseball/mlb", label: "MLB", sublabel: "Full season — pick your team", categorySlug: "baseball", browse: true },
  { provider: "espn", ref: "hockey/nhl", label: "NHL", sublabel: "Full season — pick your team", categorySlug: "nhl", browse: true },
  { provider: "espn", ref: "basketball/wnba", label: "WNBA", sublabel: "Full season — pick your team", categorySlug: "basketball", browse: true },
  { provider: "espn", ref: "soccer/eng.1", label: "Premier League", sublabel: "Full season — pick your team", categorySlug: "soccer", browse: true },
  { provider: "espn", ref: "soccer/esp.1", label: "La Liga", sublabel: "Full season — pick your team", categorySlug: "soccer", browse: true },
  { provider: "espn", ref: "soccer/ger.1", label: "Bundesliga", sublabel: "Full season — pick your team", categorySlug: "soccer", browse: true },
  { provider: "espn", ref: "soccer/ita.1", label: "Serie A", sublabel: "Full season — pick your team", categorySlug: "soccer", browse: true },
  { provider: "espn", ref: "soccer/usa.1", label: "MLS", sublabel: "Full season — pick your team", categorySlug: "soccer", browse: true },
  { provider: "espn", ref: "soccer/uefa.champions", label: "Champions League", sublabel: "Every fixture", categorySlug: "soccer", browse: true },
  { provider: "espn", ref: "football/college-football", label: "College Football", sublabel: "Search your school's team", categorySlug: "football" },
  { provider: "espn", ref: "basketball/mens-college-basketball", label: "NCAA Basketball", sublabel: "Search your school's team", categorySlug: "basketball" },
];

export function featuredCatalog(): CatalogItem[] {
  return [
    { provider: "jolpica", ref: "current", label: "Formula 1", sublabel: "Full season — races, quali & sprints", categorySlug: "f1" },
    ...LEAGUE_FOLLOWS,
    ...ICS_FEEDS,
    ...ESPN_CATALOG,
    { provider: "tmdb", ref: "upcoming", label: "Movies — upcoming releases", sublabel: "New theatrical releases", categorySlug: "screen" },
  ];
}

// Unified search across providers that support it.
export async function unifiedSearch(query: string): Promise<CatalogItem[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const searchers = [espn, thesportsdb, tmdb].filter((p) => p.search);
  const results = await Promise.allSettled(searchers.map((p) => p.search!(q)));
  const items = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  // de-dupe by provider+ref
  const seen = new Set<string>();
  const out: CatalogItem[] = [];
  for (const it of items) {
    const k = it.provider + it.ref;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out.slice(0, 24);
}
