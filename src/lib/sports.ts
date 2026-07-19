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
export interface LeagueOverview {
  ref: string;
  label: string;
  news: NewsItem[];
  standings: StandingRow[];
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
      const [news, standings] = await Promise.all([fetchNews(ref), fetchStandings(ref, favoriteTeams)]);
      return { ref, label: labelFor(ref), news, standings };
    })
  );
  if (includeF1) {
    const [news, standings] = await Promise.all([fetchNews("racing/f1"), fetchF1Standings()]);
    leagues.unshift({ ref: "racing/f1", label: "Formula 1", news, standings });
  }
  return leagues;
}
