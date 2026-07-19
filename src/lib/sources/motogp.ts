// MotoGP's public Pulselive API — free, no key. Two halves:
//  - broadcast calendar (/events?seasonYear=) → GP weekends with per-class session times
//  - results API (/results/...) → championship standings
import { fetchJSON, type NormalizedEvent, type SourceProvider } from "./types";

const API = "https://api.motogp.pulselive.com/motogp/v1";

/** ref → broadcast category name (broadcast categories have no ™ suffix). */
export const MOTOGP_CLASSES: Record<string, string> = {
  motogp: "MotoGP",
  moto2: "Moto2",
  moto3: "Moto3",
};

/** "QATAR AIRWAYS GRAND PRIX OF GREAT BRITAIN " → "Grand Prix of Great Britain" (sponsor stripped). */
export function gpTitle(raw: string): string {
  const name = raw.trim();
  const m = name.match(/(GRAND PRIX|GRAN PREMIO|GRANDE PR[EÊ]MIO|GROSSER PREIS)[\s\S]*$/i);
  const base = m ? m[0] : name;
  const small = new Set(["of", "the", "and", "de", "da", "del", "di"]);
  return base
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

interface RaceSession {
  id: string;
  title: string;
  start: string; // ISO
  sprint: boolean;
  location?: string;
  url?: string;
}

/** All Sprint + Race sessions for one class in the current season, from the broadcast calendar. */
export async function classRaces(ref: string): Promise<RaceSession[]> {
  const cls = MOTOGP_CLASSES[ref];
  if (!cls) throw new Error(`Unknown MotoGP class: ${ref}`);
  const year = new Date().getUTCFullYear();
  const events = await fetchJSON<any[]>(`${API}/events?seasonYear=${year}`, 20000);
  const out: RaceSession[] = [];
  for (const e of events || []) {
    if (e?.kind !== "GP") continue;
    const title = gpTitle(e?.name ?? "Grand Prix");
    for (const b of e?.broadcasts || []) {
      if (b?.kind !== "RACE") continue;
      if ((b?.category?.name ?? "") !== cls) continue;
      if (!b?.date_start) continue;
      const start = new Date(b.date_start);
      if (Number.isNaN(start.getTime())) continue;
      const sprint = b?.shortname === "SPR";
      out.push({
        id: String(b.id ?? `${e.id}-${b.shortname}`),
        title: `${cls}${sprint ? " Sprint" : ""} · ${title}`,
        start: start.toISOString(),
        sprint,
        location: e?.circuit?.name || undefined,
        url: typeof e?.url === "string" && e.url.startsWith("http") ? e.url : undefined,
      });
    }
  }
  return out;
}

export const motogp: SourceProvider = {
  id: "motogp",
  async fetchEvents(ref: string): Promise<NormalizedEvent[]> {
    const races = await classRaces(ref);
    return races.map((r) => ({
      extId: `motogp-${r.id}`,
      title: r.title,
      start: r.start,
      durationMin: r.sprint ? 60 : 120,
      location: r.location,
      note: "📺 MotoGP VideoPass",
      url: r.url,
    }));
  },
};

export interface MotogpStandingRow {
  rank: number;
  rider: string;
  team?: string;
  points?: string;
}

let seasonCache: { at: number; seasonId: string; categories: Array<{ id: string; name: string }> } | null = null;

async function seasonInfo() {
  if (seasonCache && Date.now() - seasonCache.at < 12 * 3600_000) return seasonCache;
  const seasons = await fetchJSON<any[]>(`${API}/results/seasons`);
  const cur = (seasons || []).find((s) => s?.current) ?? seasons?.[0];
  if (!cur?.id) throw new Error("MotoGP season list unavailable");
  const categories = await fetchJSON<any[]>(`${API}/results/categories?seasonUuid=${cur.id}`);
  seasonCache = {
    at: Date.now(),
    seasonId: cur.id,
    categories: (categories || []).map((c) => ({ id: c?.id ?? "", name: c?.name ?? "" })),
  };
  return seasonCache;
}

/** Championship standings for a class (results categories carry a ™ suffix, so prefix-match). */
export async function motogpStandings(ref: string): Promise<MotogpStandingRow[]> {
  const cls = MOTOGP_CLASSES[ref];
  if (!cls) return [];
  const info = await seasonInfo();
  const cat = info.categories.find((c) => c.name.startsWith(cls));
  if (!cat?.id) return [];
  const data = await fetchJSON<any>(`${API}/results/standings?seasonUuid=${info.seasonId}&categoryUuid=${cat.id}`);
  return (data?.classification || []).slice(0, 20).map((c: any, i: number) => ({
    rank: Number(c?.position) || i + 1,
    rider: c?.rider?.full_name ?? "—",
    team: c?.team?.name || undefined,
    points: c?.points != null ? String(c.points) : undefined,
  }));
}
