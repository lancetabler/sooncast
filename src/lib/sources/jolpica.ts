import { fetchJSON, type NormalizedEvent, type SourceProvider } from "./types";

// Jolpica (successor to Ergast) — high-quality F1 data with per-session times.
export const jolpica: SourceProvider = {
  id: "jolpica",
  async fetchEvents(): Promise<NormalizedEvent[]> {
    const data = await fetchJSON<any>("https://api.jolpi.ca/ergast/f1/current.json");
    const races = data?.MRData?.RaceTable?.Races || [];
    const out: NormalizedEvent[] = [];
    const iso = (d?: string, t?: string) => (d ? new Date(`${d}T${(t || "00:00:00Z").replace("Z", "")}Z`).toISOString() : null);
    const circuit = (r: any) => r?.Circuit?.circuitName as string | undefined;

    for (const r of races) {
      const round = r.round;
      const raceStart = iso(r.date, r.time);
      if (raceStart) {
        out.push({
          extId: `f1-${round}-race`,
          title: r.raceName,
          start: raceStart,
          durationMin: 120,
          location: circuit(r),
          url: r.url,
          note: `Round ${round} · ${r.Circuit?.Location?.locality || ""}, ${r.Circuit?.Location?.country || ""}`.trim(),
        });
      }
      const gp = (r.raceName || "").replace(/ Grand Prix$/, "");
      const sessions: Array<[string, any]> = [
        ["Qualifying", r.Qualifying],
        ["Sprint", r.Sprint],
        ["Sprint Qualifying", r.SprintQualifying || r.SprintShootout],
      ];
      for (const [name, s] of sessions) {
        const st = s && iso(s.date, s.time);
        if (st) out.push({ extId: `f1-${round}-${name.replace(/\s+/g, "").toLowerCase()}`, title: `${gp} — ${name}`, start: st, durationMin: 60, location: circuit(r) });
      }
    }
    return out;
  },
};
