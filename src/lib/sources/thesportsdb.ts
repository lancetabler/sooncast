import { fetchJSON, type CatalogItem, type NormalizedEvent, type SourceProvider } from "./types";

function key() {
  return process.env.THESPORTSDB_KEY || "3";
}
function base() {
  return `https://www.thesportsdb.com/api/v1/json/${key()}`;
}

function slugForSport(sport: string): string {
  const s = (sport || "").toLowerCase();
  if (s.includes("ice hockey")) return "nhl";
  if (s.includes("tennis")) return "tennis";
  if (s.includes("motorsport") || s.includes("racing")) return "racing";
  if (s.includes("basketball")) return "personal";
  if (s.includes("soccer") || s.includes("football")) return "personal";
  return "personal";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function startOf(ev: any): string | null {
  if (ev?.strTimestamp) {
    const d = new Date(ev.strTimestamp);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  if (ev?.dateEvent) {
    const d = new Date(`${ev.dateEvent}T${(ev.strTime || "00:00:00").slice(0, 8)}Z`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

export const thesportsdb: SourceProvider = {
  id: "thesportsdb",
  async fetchEvents(ref: string): Promise<NormalizedEvent[]> {
    // ref is a team id
    const data = await fetchJSON<any>(`${base()}/eventsnext.php?id=${encodeURIComponent(ref)}`);
    const events = data?.events || [];
    const out: NormalizedEvent[] = [];
    for (const ev of events) {
      const start = startOf(ev);
      if (!start) continue;
      out.push({
        extId: `sdb-${ev.idEvent}`,
        title: ev.strEvent || `${ev.strHomeTeam} vs ${ev.strAwayTeam}`,
        start,
        durationMin: 150,
        location: ev.strVenue || undefined,
        note: ev.strLeague || undefined,
        imageUrl: ev.strThumb || undefined,
      });
    }
    return out;
  },

  async search(query: string): Promise<CatalogItem[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const data = await fetchJSON<any>(`${base()}/searchteams.php?t=${encodeURIComponent(q)}`);
    const teams = data?.teams || [];
    return teams.slice(0, 10).map(
      (t: any): CatalogItem => ({
        provider: "thesportsdb",
        ref: t.idTeam,
        label: t.strTeam,
        sublabel: [t.strSport, t.strLeague].filter(Boolean).join(" · "),
        categorySlug: slugForSport(t.strSport),
        imageUrl: t.strBadge || t.strTeamBadge || undefined,
      })
    );
  },
};
