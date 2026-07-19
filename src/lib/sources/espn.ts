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

// Every league ESPN exposes with both /teams and /scoreboard endpoints (all verified live).
// `browse` = team list loads for an inline favorite-team picker; `college` picks the sublabel copy.
export interface TeamLeague {
  ref: string;
  name: string;
  slug: string;
  browse: boolean;
  college?: boolean;
}

export const TEAM_LEAGUES: TeamLeague[] = [
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
  { ref: "soccer/uefa.europa.conf", name: "Conference League", slug: "soccer", browse: false },
  { ref: "soccer/usa.nwsl", name: "NWSL", slug: "soccer", browse: true },
  { ref: "soccer/eng.2", name: "EFL Championship", slug: "soccer", browse: true },
  { ref: "soccer/ned.1", name: "Eredivisie", slug: "soccer", browse: true },
  { ref: "soccer/por.1", name: "Primeira Liga", slug: "soccer", browse: true },
  { ref: "soccer/sco.1", name: "Scottish Premiership", slug: "soccer", browse: true },
  { ref: "soccer/tur.1", name: "Süper Lig", slug: "soccer", browse: true },
  { ref: "soccer/bra.1", name: "Brasileirão", slug: "soccer", browse: true },
  { ref: "soccer/arg.1", name: "Argentine Primera", slug: "soccer", browse: true },
  { ref: "soccer/ksa.1", name: "Saudi Pro League", slug: "soccer", browse: true },
  { ref: "soccer/jpn.1", name: "J.League", slug: "soccer", browse: true },
  { ref: "soccer/aus.1", name: "A-League", slug: "soccer", browse: true },
  { ref: "soccer/eng.w.1", name: "Women's Super League", slug: "soccer", browse: true },
  { ref: "soccer/eng.fa", name: "FA Cup", slug: "soccer", browse: false },
  { ref: "soccer/eng.league_cup", name: "Carabao Cup", slug: "soccer", browse: false },
  { ref: "soccer/conmebol.libertadores", name: "Copa Libertadores", slug: "soccer", browse: false },
  { ref: "soccer/concacaf.champions_cup", name: "CONCACAF Champions Cup", slug: "soccer", browse: false },
  { ref: "australian-football/afl", name: "AFL — Aussie Rules", slug: "afl", browse: true },
  { ref: "rugby-league/3", name: "Rugby League (NRL)", slug: "rugby", browse: true },
  { ref: "rugby/267979", name: "Premiership Rugby", slug: "rugby", browse: true },
  { ref: "rugby/242041", name: "Super Rugby Pacific", slug: "rugby", browse: true },
  { ref: "rugby/270557", name: "United Rugby Championship", slug: "rugby", browse: true },
  { ref: "rugby/180659", name: "Six Nations", slug: "rugby", browse: true },
  { ref: "lacrosse/pll", name: "Premier Lacrosse League", slug: "lacrosse", browse: true },
  { ref: "football/college-football", name: "College Football", slug: "football", browse: true, college: true },
  { ref: "basketball/mens-college-basketball", name: "College Basketball (M)", slug: "basketball", browse: true, college: true },
  { ref: "basketball/womens-college-basketball", name: "College Basketball (W)", slug: "basketball", browse: true, college: true },
  { ref: "baseball/college-baseball", name: "College Baseball", slug: "baseball", browse: true, college: true },
  { ref: "baseball/college-softball", name: "College Softball", slug: "baseball", browse: true, college: true },
  { ref: "hockey/mens-college-hockey", name: "College Hockey (M)", slug: "nhl", browse: true, college: true },
  { ref: "hockey/womens-college-hockey", name: "College Hockey (W)", slug: "nhl", browse: true, college: true },
  { ref: "volleyball/womens-college-volleyball", name: "College Volleyball (W)", slug: "volleyball", browse: true, college: true },
  { ref: "volleyball/mens-college-volleyball", name: "College Volleyball (M)", slug: "volleyball", browse: true, college: true },
  { ref: "lacrosse/mens-college-lacrosse", name: "College Lacrosse (M)", slug: "lacrosse", browse: false, college: true },
];

// Leagues searched by team name on every keystroke (curated subset so search stays fast).
const SEARCH_LEAGUE_REFS = new Set([
  "hockey/nhl", "basketball/nba", "basketball/wnba", "football/nfl", "baseball/mlb",
  "soccer/eng.1", "soccer/esp.1", "soccer/ger.1", "soccer/ita.1", "soccer/usa.1", "soccer/uefa.champions",
  "football/college-football", "basketball/mens-college-basketball",
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

// Curated racing & individual/event-sport series — a great "follow the whole calendar" experience.
// (Team leagues live in TEAM_LEAGUES; F1 is handled by the jolpica provider.)
export const ESPN_CATALOG: CatalogItem[] = [
  { provider: "espn", ref: "racing/irl", label: "IndyCar", sublabel: "Full season", categorySlug: "racing" },
  { provider: "espn", ref: "racing/nascar-premier", label: "NASCAR Cup Series", sublabel: "Full season", categorySlug: "racing" },
  { provider: "espn", ref: "racing/nascar-secondary", label: "NASCAR Xfinity Series", sublabel: "Full season", categorySlug: "racing" },
  { provider: "espn", ref: "racing/nascar-truck", label: "NASCAR Truck Series", sublabel: "Full season", categorySlug: "racing" },
  { provider: "espn", ref: "tennis/atp", label: "Tennis — ATP", sublabel: "Upcoming tournaments", categorySlug: "tennis" },
  { provider: "espn", ref: "tennis/wta", label: "Tennis — WTA", sublabel: "Upcoming tournaments", categorySlug: "tennis" },
  { provider: "espn", ref: "golf/pga", label: "PGA Tour", sublabel: "Every tournament", categorySlug: "golf" },
  { provider: "espn", ref: "golf/lpga", label: "LPGA Tour", sublabel: "Every tournament", categorySlug: "golf" },
  { provider: "espn", ref: "golf/eur", label: "DP World Tour", sublabel: "Every tournament", categorySlug: "golf" },
  { provider: "espn", ref: "golf/liv", label: "LIV Golf", sublabel: "Every tournament", categorySlug: "golf" },
  { provider: "espn", ref: "golf/champions-tour", label: "PGA Tour Champions", sublabel: "Every tournament", categorySlug: "golf" },
  { provider: "espn", ref: "mma/ufc", label: "UFC", sublabel: "Every card", categorySlug: "combat" },
  { provider: "espn", ref: "mma/pfl", label: "PFL", sublabel: "Every card", categorySlug: "combat" },
  { provider: "espn", ref: "cricket/8048", label: "IPL Cricket", sublabel: "Full season", categorySlug: "cricket" },
  { provider: "espn", ref: "cricket/8044", label: "Big Bash League", sublabel: "Full season", categorySlug: "cricket" },
];
