import { fetchJSON, type CatalogItem, type NormalizedEvent, type SourceProvider } from "./types";

const BASE = "https://site.api.espn.com/apis/site/v2/sports";

function ymd(d: Date) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeEvent(e: any, leagueName: string): NormalizedEvent | null {
  const start = e?.date || e?.startDate;
  if (!start) return null;
  const comp = e?.competitions?.[0];
  const venue = comp?.venue?.fullName;
  const logo =
    comp?.competitors?.find((c: any) => c?.homeAway === "home")?.team?.logo ||
    comp?.competitors?.[0]?.team?.logo;
  const link = (e?.links || []).find((l: any) => l?.href)?.href;
  return {
    extId: `espn-${e.id || e.uid || start}`,
    title: e?.name || e?.shortName || "Event",
    start: new Date(start).toISOString(),
    durationMin: 180,
    location: venue || undefined,
    note: leagueName || undefined,
    url: link || undefined,
    imageUrl: logo || undefined,
  };
}

async function fetchTeamSchedule(ref: string): Promise<NormalizedEvent[]> {
  const data = await fetchJSON<any>(`${BASE}/${ref}/schedule?seasontype=2`);
  const leagueName = data?.team?.displayName || "";
  const events = data?.events || [];
  return events.map((e: any) => normalizeEvent(e, leagueName)).filter(Boolean) as NormalizedEvent[];
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
    // Search teams across the most common leagues, in parallel.
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const leagues: Array<[string, string, string]> = [
      ["hockey/nhl", "NHL", "nhl"],
      ["basketball/nba", "NBA", "racing"],
      ["football/nfl", "NFL", "racing"],
      ["baseball/mlb", "MLB", "racing"],
      ["soccer/eng.1", "Premier League", "personal"],
      ["soccer/usa.1", "MLS", "personal"],
      ["soccer/esp.1", "La Liga", "personal"],
    ];
    const results = await Promise.allSettled(
      leagues.map(async ([ref, name, slug]) => {
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
    return results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])).slice(0, 20);
  },
};

// Curated series/leagues that are a great "follow the whole calendar" experience.
export const ESPN_CATALOG: CatalogItem[] = [
  { provider: "espn", ref: "racing/f1", label: "Formula 1", sublabel: "Full season calendar", categorySlug: "f1" },
  { provider: "espn", ref: "racing/irl", label: "IndyCar", sublabel: "Full season", categorySlug: "racing" },
  { provider: "espn", ref: "racing/nascar-premier", label: "NASCAR Cup Series", sublabel: "Full season", categorySlug: "racing" },
  { provider: "espn", ref: "tennis/atp", label: "Tennis — ATP", sublabel: "Upcoming tournaments", categorySlug: "tennis" },
  { provider: "espn", ref: "tennis/wta", label: "Tennis — WTA", sublabel: "Upcoming tournaments", categorySlug: "tennis" },
  { provider: "espn", ref: "soccer/uefa.champions", label: "Champions League", sublabel: "Upcoming fixtures", categorySlug: "personal" },
  { provider: "espn", ref: "soccer/eng.1", label: "Premier League", sublabel: "Upcoming fixtures", categorySlug: "personal" },
];
