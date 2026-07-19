/* eslint-disable @typescript-eslint/no-explicit-any */
import { fetchJSON } from "@/lib/sources/types";
import { TEAM_LEAGUES, ESPN_CATALOG } from "@/lib/sources/espn";

const SITE = "https://site.api.espn.com/apis/site/v2/sports";
const WEB = "https://site.web.api.espn.com/apis/v2/sports";

export interface NewsItem {
  headline: string;
  description?: string;
  link?: string;
  image?: string;
}
export interface StandingRow {
  rank: number;
  team: string;
  logo?: string;
  record?: string;
  points?: string;
  highlight: boolean;
}
export interface ScoreTeam {
  abbr: string;
  name: string;
  score: string;
  logo?: string;
}
export interface ScoreGame {
  id: string;
  state: "pre" | "in" | "post";
  detail: string; // e.g. "Final", "7:00 PM", "3rd 4:12"
  startISO: string;
  home?: ScoreTeam;
  away?: ScoreTeam;
  /** Set for race/tournament/card events that have no home/away pairing. */
  name?: string;
  /** Winner's name for finished races/tournaments. */
  winner?: string;
  favorite: boolean;
}
export interface LeagueOverview {
  ref: string;
  label: string;
  news: NewsItem[];
  standings: StandingRow[];
  scores: ScoreGame[];
}

// Labels come from the catalogs (single source of truth) with a few extras for refs
// that aren't followable entries themselves.
const LABELS: Record<string, string> = {
  ...Object.fromEntries(TEAM_LEAGUES.map((l) => [l.ref, l.name])),
  ...Object.fromEntries(ESPN_CATALOG.filter((c) => c.provider === "espn").map((c) => [c.ref, c.label])),
  "racing/f1": "Formula 1",
  "tennis/atp": "ATP Tennis",
  "tennis/wta": "WTA Tennis",
};
function labelFor(ref: string) {
  return LABELS[ref] || ref.split("/").pop()!.toUpperCase();
}

// How each sport's data is shaped on ESPN — decides which endpoints we hit.
type LeagueKind = "team" | "racing" | "tennis" | "event";
function kindOf(ref: string): LeagueKind {
  const sport = ref.split("/")[0];
  if (sport === "racing") return "racing";
  if (sport === "tennis") return "tennis";
  if (sport === "golf" || sport === "mma" || sport === "boxing") return "event";
  return "team";
}

async function fetchNews(ref: string): Promise<NewsItem[]> {
  try {
    const data = await fetchJSON<any>(`${SITE}/${ref}/news`);
    return (data?.articles || []).slice(0, 5).map((a: any) => ({
      headline: a.headline,
      description: a.description,
      link: a.links?.web?.href,
      image: a.images?.[0]?.url,
    }));
  } catch {
    return [];
  }
}

// Team leagues AND racing series share this endpoint; racing entries carry an
// `athlete` (driver) instead of a `team`, nested under `children`.
async function fetchStandings(ref: string, favorites: Set<string>): Promise<StandingRow[]> {
  try {
    const data = await fetchJSON<any>(`${WEB}/${ref}/standings?region=us&lang=en&contentorigin=espn&type=0&level=1`);
    const entries: any[] = data?.standings?.entries || (data?.children || []).flatMap((c: any) => c?.standings?.entries || []);
    const stat = (e: any, ...names: string[]) => {
      for (const n of names) {
        const s = (e.stats || []).find((x: any) => x.name === n || x.type === n || x.abbreviation === n);
        if (s && (s.displayValue || s.value != null)) return s.displayValue ?? String(s.value ?? "");
      }
      return undefined;
    };
    return entries.slice(0, 20).map((e, i) => {
      const name = e.team?.displayName ?? e.team?.name ?? e.athlete?.displayName ?? "—";
      return {
        rank: Number(stat(e, "rank", "playoffSeed") ?? i + 1) || i + 1,
        team: name,
        logo: e.team?.logos?.[0]?.href,
        record: stat(e, "overall", "total", "record"),
        points: stat(e, "points", "championshipPts"),
        highlight: favorites.has(name),
      };
    });
  } catch {
    return [];
  }
}

// Tennis has world rankings instead of league standings.
async function fetchRankings(ref: string): Promise<StandingRow[]> {
  try {
    const data = await fetchJSON<any>(`${SITE}/${ref}/rankings`);
    const ranks: any[] = data?.rankings?.[0]?.ranks || [];
    return ranks.slice(0, 20).map((r: any, i: number) => ({
      rank: Number(r.current) || i + 1,
      team: r.athlete?.displayName ?? "—",
      points: r.points != null ? String(Math.round(r.points)) : undefined,
      highlight: false,
    }));
  } catch {
    return [];
  }
}

function ymd(d: Date) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

function stateOf(ev: any): ScoreGame["state"] {
  return (ev?.status?.type?.state as ScoreGame["state"]) ?? "pre";
}

async function fetchScores(ref: string, favorites: Set<string>): Promise<ScoreGame[]> {
  try {
    const from = new Date(Date.now() - 2 * 86400_000);
    const to = new Date(Date.now() + 4 * 86400_000);
    const data = await fetchJSON<any>(`${SITE}/${ref}/scoreboard?dates=${ymd(from)}-${ymd(to)}&limit=100`);
    const teamOf = (c: any): ScoreTeam | undefined =>
      c
        ? {
            abbr: c.team?.abbreviation ?? c.team?.shortDisplayName ?? "",
            name: c.team?.displayName ?? c.team?.shortDisplayName ?? "",
            score: c.score ?? "",
            logo: c.team?.logo ?? c.team?.logos?.[0]?.href,
          }
        : undefined;

    const games: ScoreGame[] = (data?.events || []).map((ev: any) => {
      const comp = ev?.competitions?.[0];
      const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
      const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
      return {
        id: String(ev?.id ?? ev?.uid ?? ev?.date ?? ""),
        state: stateOf(ev),
        detail: ev?.status?.type?.shortDetail ?? "",
        startISO: ev?.date ?? "",
        home: teamOf(home),
        away: teamOf(away),
        favorite: favorites.has(home?.team?.displayName ?? "\0") || favorites.has(away?.team?.displayName ?? "\0"),
      };
    });

    // Live games first, then upcoming (soonest), then recent finals; favorites float up within a group.
    const rank = (g: ScoreGame) => (g.state === "in" ? 0 : g.state === "pre" ? 1 : 2);
    games.sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      const ta = new Date(a.startISO).getTime();
      const tb = new Date(b.startISO).getTime();
      return rank(a) === 2 ? tb - ta : ta - tb; // finals newest-first, others soonest-first
    });
    return games.slice(0, 12);
  } catch {
    return [];
  }
}

// Races, golf tournaments, fight cards — one-name events instead of home/away games.
async function fetchEventCards(ref: string): Promise<ScoreGame[]> {
  try {
    const from = new Date(Date.now() - 8 * 86400_000);
    const to = new Date(Date.now() + 30 * 86400_000);
    const data = await fetchJSON<any>(`${SITE}/${ref}/scoreboard?dates=${ymd(from)}-${ymd(to)}&limit=50`);
    const cards: ScoreGame[] = (data?.events || []).map((ev: any) => {
      const state = stateOf(ev);
      const comp = ev?.competitions?.[0];
      const winner =
        state === "post"
          ? comp?.competitors?.find((c: any) => c?.winner)?.athlete?.displayName ??
            comp?.competitors?.find((c: any) => c?.winner)?.team?.displayName
          : undefined;
      return {
        id: String(ev?.id ?? ev?.uid ?? ev?.date ?? ""),
        state,
        detail: ev?.status?.type?.shortDetail ?? "",
        startISO: ev?.date ?? "",
        name: ev?.name ?? ev?.shortName ?? "Event",
        winner: winner || undefined,
        favorite: false,
      };
    });
    const rank = (g: ScoreGame) => (g.state === "in" ? 0 : g.state === "pre" ? 1 : 2);
    cards.sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      const ta = new Date(a.startISO).getTime();
      const tb = new Date(b.startISO).getTime();
      return rank(a) === 2 ? tb - ta : ta - tb;
    });
    return cards.slice(0, 6);
  } catch {
    return [];
  }
}

async function fetchF1Standings(): Promise<StandingRow[]> {
  try {
    const data = await fetchJSON<any>("https://api.jolpi.ca/ergast/f1/current/driverStandings.json");
    const list: any[] = data?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || [];
    return list.slice(0, 20).map((d) => ({
      rank: Number(d.position) || 0,
      team: `${(d.Driver?.givenName ?? "")[0] ?? ""}. ${d.Driver?.familyName ?? ""}`.trim(),
      record: d.Constructors?.[0]?.name,
      points: d.points,
      highlight: false,
    }));
  } catch {
    return [];
  }
}

async function buildLeague(ref: string, favorites: Set<string>): Promise<LeagueOverview> {
  const kind = kindOf(ref);
  if (ref === "racing/f1") {
    // Jolpica has the richer championship table; ESPN still supplies news + race cards.
    const [news, standings, scores] = await Promise.all([fetchNews(ref), fetchF1Standings(), fetchEventCards(ref)]);
    return { ref, label: "Formula 1", news, standings, scores };
  }
  const [news, standings, scores] = await Promise.all([
    fetchNews(ref),
    kind === "tennis" ? fetchRankings(ref) : kind === "event" ? Promise.resolve([]) : fetchStandings(ref, favorites),
    kind === "team" ? fetchScores(ref, favorites) : kind === "tennis" ? Promise.resolve([]) : fetchEventCards(ref),
  ]);
  return { ref, label: labelFor(ref), news, standings, scores };
}

/** Build the Scores overview for every league the user follows (team, racing, tennis, golf, MMA, …). */
export async function getSportsOverview(leagueRefs: string[], favoriteTeams: Set<string>, includeF1 = false): Promise<LeagueOverview[]> {
  const uniq = [...new Set(leagueRefs)].filter((r) => r !== "racing/f1").slice(0, 12);
  const refs = includeF1 ? ["racing/f1", ...uniq] : uniq;
  return Promise.all(refs.map((ref) => buildLeague(ref, favoriteTeams)));
}
