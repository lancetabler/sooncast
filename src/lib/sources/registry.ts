import { espn, ESPN_CATALOG, TEAM_LEAGUES } from "./espn";
import { jolpica } from "./jolpica";
import { motogp } from "./motogp";
import { thesportsdb, tsdbConfigured } from "./thesportsdb";
import { icsfeed } from "./icsfeed";
import { tmdb } from "./tmdb";
import { leagueBlurb } from "@/lib/domain/league-info";
import type { CatalogItem, NormalizedEvent, SourceProvider } from "./types";

export { leagueTeams } from "./espn";

const PROVIDERS: Record<string, SourceProvider> = {
  espn,
  jolpica,
  motogp,
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
  { provider: "ics", ref: "https://calendar.google.com/calendar/ical/njulhksvo83qeoruc3nhend9js%40group.calendar.google.com/public/basic.ics", label: "IMSA WeatherTech", sublabel: "SportsCar Championship — full season", categorySlug: "imsa", description: "IMSA — the WeatherTech SportsCar Championship, North America's top endurance/sprint sports-car series; home of the Rolex 24 at Daytona." },
  { provider: "ics", ref: "https://calendar.google.com/calendar/ical/61jccgg4rshh1temqk0dj4lens%40group.calendar.google.com/public/basic.ics", label: "FIA WEC", sublabel: "World Endurance Championship + Le Mans", categorySlug: "wec", description: "FIA WEC — the World Endurance Championship for sports cars (Hypercars & GT3), including the legendary 24 Hours of Le Mans." },
];

// Follow a whole league's season, or open its team picker to just track your club.
// Derived from TEAM_LEAGUES so espn.ts stays the single source of truth.
const LEAGUE_FOLLOWS: CatalogItem[] = TEAM_LEAGUES.map((l) => ({
  provider: "espn",
  ref: l.ref,
  label: l.name,
  sublabel: l.college
    ? l.browse
      ? "Pick your school's team"
      : "Full college season"
    : l.browse
      ? "Full season — pick your team"
      : "Every fixture",
  categorySlug: l.slug,
  browse: l.browse,
}));

// MotoGP's own public API — races & sprints with exact session times.
const MOTOGP_CATALOG: CatalogItem[] = [
  { provider: "motogp", ref: "motogp", label: "MotoGP", sublabel: "Full season — races & sprints", categorySlug: "racing" },
  { provider: "motogp", ref: "moto2", label: "Moto2", sublabel: "Full season", categorySlug: "racing" },
  { provider: "motogp", ref: "moto3", label: "Moto3", sublabel: "Full season", categorySlug: "racing" },
];

// TheSportsDB (premium key) — every small televised series. League ids verified live.
const TSDB_CATALOG: CatalogItem[] = [
  { provider: "thesportsdb", ref: "4409", label: "WRC — World Rally", sublabel: "Full season", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "4371", label: "Formula E", sublabel: "Full season", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "4486", label: "Formula 2", sublabel: "Full season", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "4487", label: "Formula 3", sublabel: "Full season", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "5382", label: "F1 Academy", sublabel: "Full season", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "4454", label: "World Superbike (WSBK)", sublabel: "Full season", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "5264", label: "British Superbikes (BSB)", sublabel: "Full season", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "4372", label: "BTCC", sublabel: "British Touring Cars — full season", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "4438", label: "DTM", sublabel: "Full season", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "4489", label: "Supercars (Australia)", sublabel: "Full season", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "4468", label: "AMA Supercross", sublabel: "Full season", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "4469", label: "Pro Motocross", sublabel: "Full season", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "5412", label: "SuperMotocross", sublabel: "Playoffs & finals", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "5309", label: "NHRA Drag Racing", sublabel: "Full season", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "5094", label: "NASCAR ARCA Series", sublabel: "Full season", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "4730", label: "World Rallycross", sublabel: "Full season", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "4712", label: "Extreme E", sublabel: "Full season", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "4447", label: "Dakar Rally", sublabel: "Every stage", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "4732", label: "Isle of Man TT", sublabel: "Every race", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "4440", label: "GT World Challenge", sublabel: "Full season", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "5491", label: "FIM Endurance (EWC)", sublabel: "Full season", categorySlug: "racing" },
  { provider: "thesportsdb", ref: "4445", label: "Boxing", sublabel: "Major cards worldwide", categorySlug: "combat" },
  { provider: "thesportsdb", ref: "4554", label: "PDC Darts", sublabel: "Every tournament", categorySlug: "darts" },
  { provider: "thesportsdb", ref: "4555", label: "World Snooker", sublabel: "Every tournament", categorySlug: "snooker" },
  { provider: "thesportsdb", ref: "5007", label: "World Athletics Championships", sublabel: "Every session", categorySlug: "athletics" },
];

export function featuredCatalog(): CatalogItem[] {
  // Order defines the Discover groups: racing block first, then team leagues, then event sports.
  // TheSportsDB entries only appear once its key is configured.
  const racing = ESPN_CATALOG.filter((c) => c.categorySlug === "racing");
  const rest = ESPN_CATALOG.filter((c) => c.categorySlug !== "racing");
  // TheSportsDB is community-maintained — say so up front, before the user follows.
  const communal = (c: CatalogItem): CatalogItem => ({ ...c, sublabel: `${c.sublabel} · community data` });
  const tsdbRacing = tsdbConfigured() ? TSDB_CATALOG.filter((c) => c.categorySlug === "racing").map(communal) : [];
  const tsdbRest = tsdbConfigured() ? TSDB_CATALOG.filter((c) => c.categorySlug !== "racing").map(communal) : [];
  return [
    { provider: "jolpica", ref: "current", label: "Formula 1", sublabel: "Full season — races, quali & sprints", categorySlug: "f1" },
    ...racing,
    ...MOTOGP_CATALOG,
    ...tsdbRacing,
    ...ICS_FEEDS,
    ...LEAGUE_FOLLOWS,
    ...rest,
    ...tsdbRest,
    { provider: "tmdb", ref: "upcoming", label: "Movies — upcoming releases", sublabel: "New theatrical releases", categorySlug: "screen" },
  ];
}

// Unified search across the featured catalog + providers that support live search.
export async function unifiedSearch(query: string): Promise<CatalogItem[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const ql = q.toLowerCase();

  // Local, synchronous match over the featured catalog (racing series, event sports, leagues)
  // by name / sublabel / plain-English blurb — otherwise searching "motogp", "wrc", "imsa",
  // "indycar", "rally", "endurance"… returned nothing (they only showed on an empty query).
  const local = featuredCatalog().filter((c) => {
    const hay = `${c.label} ${c.sublabel ?? ""} ${c.description ?? ""} ${leagueBlurb(c.ref) ?? ""}`.toLowerCase();
    return hay.includes(ql);
  });

  const searchers = [espn, tmdb].filter((p) => p.search);
  const results = await Promise.allSettled(searchers.map((p) => p.search!(q)));
  const remote = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  // Featured catalog first (so a "motogp" search leads with MotoGP, not a team called that),
  // then live provider results; de-dupe by provider+ref.
  const seen = new Set<string>();
  const out: CatalogItem[] = [];
  for (const it of [...local, ...remote]) {
    const k = it.provider + it.ref;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out.slice(0, 24);
}
