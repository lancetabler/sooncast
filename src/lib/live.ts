import { fetchJSON } from "@/lib/sources/types";

const BASE = "https://site.api.espn.com/apis/site/v2/sports";

export interface LiveStatus {
  state: "pre" | "in" | "post";
  detail: string;
  home?: { abbr: string; score: string };
  away?: { abbr: string; score: string };
}

export interface LiveQuery {
  eventId: string;
  sourceExtId: string | null;
  followRef: string | null; // e.g. "hockey/nhl/teams/17" or "soccer/eng.1"
  start: Date;
}

function ymd(d: Date) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}
function espnId(sourceExtId: string | null): string | null {
  const m = (sourceExtId || "").match(/espn:espn-(\d+)/);
  return m ? m[1] : null;
}

export function scoreString(s: LiveStatus): string | null {
  if (!s.away || !s.home) return null;
  return `${s.away.abbr} ${s.away.score}-${s.home.score} ${s.home.abbr}`;
}

/** Fetch ESPN status/score for the given events, grouping API calls by league+date. */
export async function getLiveStatuses(items: LiveQuery[]): Promise<Record<string, LiveStatus>> {
  const groups = new Map<string, { leagueRef: string; date: string; items: { eventId: string; id: string }[] }>();
  for (const it of items) {
    const id = espnId(it.sourceExtId);
    const leagueRef = (it.followRef || "").split("/teams/")[0];
    if (!id || !leagueRef) continue;
    const date = ymd(it.start);
    const key = `${leagueRef}@${date}`;
    if (!groups.has(key)) groups.set(key, { leagueRef, date, items: [] });
    groups.get(key)!.items.push({ eventId: it.eventId, id });
  }

  const result: Record<string, LiveStatus> = {};
  await Promise.all(
    [...groups.values()].map(async (g) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await fetchJSON<any>(`${BASE}/${g.leagueRef}/scoreboard?dates=${g.date}&limit=1000`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const byId = new Map<string, any>();
        for (const ev of data?.events || []) byId.set(String(ev.id), ev);
        for (const it of g.items) {
          const ev = byId.get(it.id);
          const st = ev?.status?.type;
          if (!st) continue;
          const comp = ev?.competitions?.[0];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
          result[it.eventId] = {
            state: st.state,
            detail: st.shortDetail || "",
            home: home ? { abbr: home.team?.abbreviation ?? "H", score: home.score ?? "" } : undefined,
            away: away ? { abbr: away.team?.abbreviation ?? "A", score: away.score ?? "" } : undefined,
          };
        }
      } catch {
        /* skip this league */
      }
    })
  );
  return result;
}
