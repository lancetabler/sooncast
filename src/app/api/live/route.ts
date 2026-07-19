import { requireUser, isResponse, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { fetchJSON } from "@/lib/sources/types";

export const dynamic = "force-dynamic";

const BASE = "https://site.api.espn.com/apis/site/v2/sports";

export interface LiveStatus {
  state: "pre" | "in" | "post";
  detail: string;
  home?: { abbr: string; score: string };
  away?: { abbr: string; score: string };
}

function ymd(d: Date) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}
function espnIdFromExt(sourceExtId: string | null): string | null {
  // "espn:espn-401589999" -> "401589999"
  const m = (sourceExtId || "").match(/espn:espn-(\d+)/);
  return m ? m[1] : null;
}

// Returns live/final status + score for the requested ESPN-sourced events.
export async function GET(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const ids = (new URL(req.url).searchParams.get("ids") || "").split(",").filter(Boolean).slice(0, 60);
  if (!ids.length) return ok({});

  const events = await prisma.event.findMany({
    where: { id: { in: ids }, userId: user.id, sourceProvider: "espn" },
    include: { follow: true },
  });

  // group by league scoreboard + date so we fetch each board once
  const groups = new Map<string, { leagueRef: string; date: string; items: { eventId: string; espnId: string }[] }>();
  for (const e of events) {
    const espnId = espnIdFromExt(e.sourceExtId);
    const leagueRef = (e.follow?.ref || "").split("/teams/")[0];
    if (!espnId || !leagueRef) continue;
    const date = ymd(e.start);
    const key = `${leagueRef}@${date}`;
    if (!groups.has(key)) groups.set(key, { leagueRef, date, items: [] });
    groups.get(key)!.items.push({ eventId: e.id, espnId });
  }

  const result: Record<string, LiveStatus> = {};
  await Promise.all(
    [...groups.values()].map(async (g) => {
      try {
        const data = await fetchJSON<any>(`${BASE}/${g.leagueRef}/scoreboard?dates=${g.date}&limit=1000`);
        const byId = new Map<string, any>();
        for (const ev of data?.events || []) byId.set(String(ev.id), ev);
        for (const it of g.items) {
          const ev = byId.get(it.espnId);
          const st = ev?.status?.type;
          if (!st) continue;
          const comp = ev?.competitions?.[0];
          const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
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

  return ok(result);
}
