import { fetchJSON, type CatalogItem, type NormalizedEvent, type SourceProvider } from "./types";

const BASE = "https://site.api.espn.com/apis/site/v2/sports";

function ymd(d: Date) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Networks / streaming services carrying a game — "where to watch".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function broadcastsOf(comp: any): string | undefined {
  const list = comp?.broadcasts;
  if (!Array.isArray(list) || !list.length) return undefined;
  const names: string[] = [];
  for (const b of list) if (b?.market === "national") for (const n of b?.names || []) names.push(n);
  for (const b of list) if (b?.market !== "national") for (const n of b?.names || []) names.push(n);
  const uniq = [...new Set(names.filter(Boolean))].slice(0, 3);
  return uniq.length ? uniq.join(", ") : undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeEvent(e: any, leagueName: string): NormalizedEvent | null {
  const start = e?.date || e?.startDate;
  if (!start) return null;
  const comp = e?.competitions?.[0];
  const v = comp?.venue;
  const city = [v?.address?.city, v?.address?.state || v?.address?.country].filter(Boolean).join(", ");
  // Include the city alongside the venue so it reads well and weather can geocode it.
  const venue = v?.fullName ? (city ? `${v.fullName}, ${city}` : v.fullName) : city || undefined;
  const logo =
    comp?.competitors?.find((c: any) => c?.homeAway === "home")?.team?.logo ||
    comp?.competitors?.[0]?.team?.logo;
  const link = (e?.links || []).find((l: any) => l?.href)?.href;
  const network = broadcastsOf(comp);
  return {
    extId: `espn-${e.id || e.uid || start}`,
    title: e?.name || e?.shortName || "Event",
    start: new Date(start).toISOString(),
    durationMin: 180,
    location: venue || undefined,
    note: network ? `📺 ${network}` : leagueName || undefined,
    url: link || undefined,
    imageUrl: logo || undefined,
  };
}

async function fetchTeamSchedule(ref: string): Promise<NormalizedEvent[]> {
  // Whole current schedule (all season types); we filter to upcoming below.
  const data = await fetchJSON<any>(`${BASE}/${ref}/schedule`);
  const leagueName = data?.team?.displayName || "";
  const events = data?.events || [];
  const cutoff = Date.now() - 2 * 86400_000; // keep from ~2 days ago onward
  return (events.map((e: any) => normalizeEvent(e, leagueName)).filter(Boolean) as NormalizedEvent[]).filter(
    (n) => new Date(n.start).getTime() >= cutoff
  );
}

// Every major league ESPN exposes with both /teams and /scoreboard endpoints.
// `browse` = small enough team list to pick from inline (pro leagues); college is search-only.
export const TEAM_LEAGUES: Array<{ ref: string; name: string; slug: string; browse: boolean }> = [
  { ref: "hockey/nhl", name: "NHL", slug: "nhl", browse: true },
  { ref: "basketball/nba", name: "NBA", slug: "basketball", browse: true },
  { ref: "basketball/wnba", name: "WNBA", slug: "basketball", browse: true },
  { ref: "football/nfl", name: "NFL", slug: "football", browse: true },
  { ref: "baseball/mlb", name: "MLB", slug: "baseball", browse: true },
  { ref: "soccer/eng.1", name: "Premier League", slug: "soccer", browse: true },
  { ref: "soccer/esp.1", name: "La Liga", slug: "soccer", browse: true },
  { ref: "soccer/ger.1", name: "Bundesliga", slug: "soccer", browse: true },
  { ref: "soccer/ita.1", name: "Serie A", slug: "soccer", browse: true },
  { ref: "soccer/fra.1", name: "Ligue 1", slug: "soccer", browse: true },
  { ref: "soccer/usa.1", name: "MLS", slug: "soccer", browse: true },
  { ref: "soccer/mex.1", name: "Liga MX", slug: "soccer", browse: true },
  { ref: "soccer/uefa.champions", name: "Champions League", slug: "soccer", browse: true },
  { ref: "soccer/uefa.europa", name: "Europa League", slug: "soccer", browse: true },
  { ref: "soccer/usa.nwsl", name: "NWSL", slug: "soccer", browse: true },
  { ref: "soccer/eng.2", name: "EFL Championship", slug: "soccer", browse: true },
  { ref: "soccer/ned.1", name: "Eredivisie", slug: "soccer", browse: true },
  { ref: "soccer/por.1", name: "Primeira Liga", slug: "soccer", browse: true },
  { ref: "football/college-football", name: "College Football", slug: "football", browse: false },
  { ref: "basketball/mens-college-basketball", name: "NCAA Basketball", slug: "basketball", browse: false },
];

// Leagues searched by team name on every keystroke (curated subset so search stays fast).
const SEARCH_LEAGUE_REFS = new Set([
  "hockey/nhl", "basketball/nba", "basketball/wnba", "football/nfl", "baseball/mlb",
  "soccer/eng.1", "soccer/esp.1", "soccer/ger.1", "soccer/ita.1", "soccer/usa.1", "soccer/uefa.champions",
]);
const SEARCH_LEAGUES = TEAM_LEAGUES.filter((l) => SEARCH_LEAGUE_REFS.has(l.ref));

/** List all teams in a league as followable catalog items (favorite-team picker). */
export async function leagueTeams(ref: string): Promise<CatalogItem[]> {
  const meta = TEAM_LEAGUES.find((l) => l.ref === ref);
  const data = await fetchJSON<any>(`${BASE}/${ref}/teams?limit=1000`);
  const teams = (data?.sports?.[0]?.leagues?.[0]?.teams || []).map((t: any) => t.team).filter(Boolean);
  return teams
    .sort((a: any, b: any) => (a.displayName || "").localeCompare(b.displayName || ""))
    .map(
      (t: any): CatalogItem => ({
        provider: "espn",
        ref: `${ref}/teams/${t.id}`,
        label: t.displayName,
        sublabel: meta?.name ?? "Team",
        categorySlug: meta?.slug ?? "personal",
        imageUrl: t.logos?.[0]?.href,
      })
    );
}

export const espn: SourceProvider = {
  id: "espn",
  async fetchEvents(ref: string): Promise<NormalizedEvent[]> {
    if (ref.includes("/teams/")) return fetchTeamSchedule(ref);

    const from = new Date();
    const to = new Date(Date.now() + 150 * 86400_000);
    const url = `${BASE}/${ref}/scoreboard?limit=1000&dates=${ymd(from)}-${ymd(to)}`;
    const data = await fetchJSON<any>(url);
    const leagueName = data?.leagues?.[0]?.name || "";

    const out = new Map<string, NormalizedEvent>();
    for (const e of data?.events || []) {
      const n = normalizeEvent(e, leagueName);
      if (n) out.set(n.extId, n);
    }
    // Motorsport & some series expose the full season under leagues[].calendar
    for (const c of data?.leagues?.[0]?.calendar || []) {
      if (!c?.startDate) continue;
      const startISO = new Date(c.startDate).toISOString();
      const extId = `espn-cal-${ref}-${startISO}`;
      if (!out.has(extId)) {
        out.set(extId, {
          extId,
          title: c.label || leagueName || "Event",
          start: startISO,
          durationMin: 150,
          note: leagueName || undefined,
        });
      }
    }
    return [...out.values()];
  },

  async search(query: string): Promise<CatalogItem[]> {
    // Search teams by name across the major pro leagues, in parallel.
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const results = await Promise.allSettled(
      SEARCH_LEAGUES.map(async ({ ref, name, slug }) => {
        const data = await fetchJSON<any>(`${BASE}/${ref}/teams?limit=1000`);
        const teams = data?.sports?.[0]?.leagues?.[0]?.teams || [];
        return teams
          .map((t: any) => t.team)
          .filter((t: any) => (t?.displayName || "").toLowerCase().includes(q))
          .slice(0, 5)
          .map(
            (t: any): CatalogItem => ({
              provider: "espn",
              ref: `${ref}/teams/${t.id}`,
              label: t.displayName,
              sublabel: name,
              categorySlug: slug,
              imageUrl: t.logos?.[0]?.href,
            })
          );
      })
    );
    return results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])).slice(0, 24);
  },
};

// Curated racing & individual-sport series — a great "follow the whole calendar" experience.
// (Team leagues live in TEAM_LEAGUES; F1 is handled by the jolpica provider.)
export const ESPN_CATALOG: CatalogItem[] = [
  { provider: "espn", ref: "racing/irl", label: "IndyCar", sublabel: "Full season", categorySlug: "racing" },
  { provider: "espn", ref: "racing/nascar-premier", label: "NASCAR Cup Series", sublabel: "Full season", categorySlug: "racing" },
  { provider: "espn", ref: "racing/nascar-secondary", label: "NASCAR Xfinity Series", sublabel: "Full season", categorySlug: "racing" },
  { provider: "espn", ref: "racing/nascar-truck", label: "NASCAR Truck Series", sublabel: "Full season", categorySlug: "racing" },
  { provider: "espn", ref: "tennis/atp", label: "Tennis — ATP", sublabel: "Upcoming tournaments", categorySlug: "tennis" },
  { provider: "espn", ref: "tennis/wta", label: "Tennis — WTA", sublabel: "Upcoming tournaments", categorySlug: "tennis" },
];
