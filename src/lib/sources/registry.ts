import { espn, ESPN_CATALOG } from "./espn";
import { jolpica } from "./jolpica";
import { thesportsdb } from "./thesportsdb";
import { icsfeed } from "./icsfeed";
import { tmdb } from "./tmdb";
import type { CatalogItem, NormalizedEvent, SourceProvider } from "./types";

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
  { provider: "ics", ref: "https://calendar.google.com/calendar/ical/hlskhf7l8ce7btind39bb9kf1o%40group.calendar.google.com/public/basic.ics", label: "IndyCar", sublabel: "Full season", categorySlug: "racing" },
];

export function featuredCatalog(): CatalogItem[] {
  return [
    { provider: "jolpica", ref: "current", label: "Formula 1", sublabel: "Full season — races, quali & sprints", categorySlug: "f1" },
    ...ICS_FEEDS,
    ...ESPN_CATALOG.filter((c) => c.ref !== "racing/f1"),
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
