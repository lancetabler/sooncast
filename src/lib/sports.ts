/* eslint-disable @typescript-eslint/no-explicit-any */
import { fetchJSON } from "@/lib/sources/types";

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
  favorite: boolean;
}
export interface LeagueOverview {
  ref: string;
  label: string;
  news: NewsItem[];
  standings: StandingRow[];
  scores: ScoreGame[];
}

const LEAGUE_NAMES: Record<string, string> = {
  "hockey/nhl": "NHL",
  "basketball/nba": "NBA",
  "football/nfl": "NFL",
  "baseball/mlb": "MLB",
  "soccer/eng.1": "Premier League",
  "soccer/esp.1": "La Liga",
  "soccer/ita.1": "Serie A",
  "soccer/ger.1": "Bundesliga",
  "soccer/usa.1": "MLS",
  "soccer/uefa.champions": "Champions League",
  "racing/f1": "Formula 1",
  "racing/irl": "IndyCar",
  "tennis/atp": "ATP Tennis",
  "tennis/wta": "WTA Tennis",
};
function labelFor(ref: string) {
  return LEAGUE_NAMES[ref] || ref.split("/").pop()!.toUpperCase();
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

async function fetchStandings(ref: string, favorites: Set<string>): Promise<StandingRow[]> {
  try {
    const data = await fetchJSON<any>(`${WEB}/${ref}/standings?region=us&lang=en&contentorigin=espn&type=0&level=1`);
    const entries: any[] = data?.standings?.entries || (data?.children || []).flatMap((c: any) => c?.standings?.entries || []);
    const stat = (e: any, ...names: string[]) => {
      for (const n of names) {
        const s = (e.stats || []).find((x: any) => x.name === n || x.type === n || x.abbreviation === n);
        if (s) return s.displayValue ?? String(s.value ?? "");
      }
      return undefined;
    };
    return entries.slice(0, 20).map((e, i) => ({
      rank: Number(stat(e, "rank", "playoffSeed") ?? i + 1) || i + 1,
      team: e.team?.displayName ?? e.team?.name ?? "—",
      logo: e.team?.logos?.[0]?.href,
      record: stat(e, "overall", "total", "record"),
      points: stat(e, "points"),
      highlight: favorites.has(e.team?.displayName ?? ""),
    }));
  } catch {
    return [];
  }
}

function ymd(d: Date) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
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
      const st = ev?.status?.type;
      const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
      const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
      return {
        id: String(ev?.id ?? ev?.uid ?? ev?.date ?? ""),
        state: (st?.state as ScoreGame["state"]) ?? "pre",
        detail: st?.shortDetail ?? "",
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

/** Build the Scores overview for a user's followed leagues (ESPN team sports + optional F1). */
export async function getSportsOverview(leagueRefs: string[], favoriteTeams: Set<string>, includeF1 = false): Promise<LeagueOverview[]> {
  const uniq = [...new Set(leagueRefs)].slice(0, 6);
  const leagues = await Promise.all(
    uniq.map(async (ref) => {
      const [news, standings, scores] = await Promise.all([
        fetchNews(ref),
        fetchStandings(ref, favoriteTeams),
        fetchScores(ref, favoriteTeams),
      ]);
      return { ref, label: labelFor(ref), news, standings, scores };
    })
  );
  if (includeF1) {
    const [news, standings] = await Promise.all([fetchNews("racing/f1"), fetchF1Standings()]);
    leagues.unshift({ ref: "racing/f1", label: "Formula 1", news, standings, scores: [] });
  }
  return leagues;
}
