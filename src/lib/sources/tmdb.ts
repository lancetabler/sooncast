import { fetchJSON, type CatalogItem, type NormalizedEvent, type SourceProvider } from "./types";

// Movie & TV release dates via TMDB. Requires TMDB_API_KEY (v3). Degrades to empty if unset.
function apiKey() {
  return process.env.TMDB_API_KEY || "";
}
const IMG = "https://image.tmdb.org/t/p/w200";

function fmtRelease(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC", ...(sameYear ? {} : { year: "numeric" }) });
}

// Browsable list of upcoming theatrical releases, each followable on its own
// (ref "movie/{id}") — so users pick the films they care about instead of
// inheriting the whole "upcoming" firehose.
export async function upcomingMovies(): Promise<CatalogItem[]> {
  if (!apiKey()) return [];
  const today = new Date().toISOString().slice(0, 10);
  const pages = await Promise.allSettled(
    [1, 2, 3].map((p) =>
      fetchJSON<any>(`https://api.themoviedb.org/3/movie/upcoming?api_key=${apiKey()}&region=US&page=${p}`)
    )
  );
  const seen = new Set<number>();
  const out: Array<CatalogItem & { _date: string }> = [];
  for (const page of pages) {
    if (page.status !== "fulfilled") continue;
    for (const m of page.value?.results || []) {
      // The endpoint's window includes films already in theaters — only future dates count down.
      if (!m.id || !m.release_date || m.release_date < today || seen.has(m.id)) continue;
      seen.add(m.id);
      out.push({
        provider: "tmdb",
        ref: `movie/${m.id}`,
        label: m.title,
        sublabel: `In theaters ${fmtRelease(m.release_date)}`,
        categorySlug: "screen",
        imageUrl: m.poster_path ? IMG + m.poster_path : undefined,
        description: m.overview || undefined,
        _date: m.release_date,
      });
    }
  }
  out.sort((a, b) => a._date.localeCompare(b._date));
  return out.map(({ _date, ...item }) => item);
}

export const tmdb: SourceProvider = {
  id: "tmdb",
  async fetchEvents(ref: string): Promise<NormalizedEvent[]> {
    if (!apiKey()) return [];
    if (ref === "upcoming") {
      const data = await fetchJSON<any>(`https://api.themoviedb.org/3/movie/upcoming?api_key=${apiKey()}&region=US`);
      return (data?.results || [])
        .filter((m: any) => m.release_date)
        .map((m: any): NormalizedEvent => ({
          extId: `tmdb-movie-${m.id}`,
          title: `${m.title} (release)`,
          start: new Date(`${m.release_date}T00:00:00Z`).toISOString(),
          durationMin: 24 * 60,
          note: "Movie release",
          imageUrl: m.poster_path ? IMG + m.poster_path : undefined,
          url: `https://www.themoviedb.org/movie/${m.id}`,
        }));
    }
    // ref = "movie/{id}"
    const m = ref.match(/^movie\/(\d+)$/);
    if (m) {
      const data = await fetchJSON<any>(`https://api.themoviedb.org/3/movie/${m[1]}?api_key=${apiKey()}`);
      if (!data?.release_date) return [];
      return [{
        extId: `tmdb-movie-${data.id}`,
        title: `${data.title} (release)`,
        start: new Date(`${data.release_date}T00:00:00Z`).toISOString(),
        durationMin: 24 * 60,
        note: "Movie release",
        imageUrl: data.poster_path ? IMG + data.poster_path : undefined,
        url: `https://www.themoviedb.org/movie/${data.id}`,
      }];
    }

    // ref = "tv/{id}" — upcoming episodes across the latest seasons
    const t = ref.match(/^tv\/(\d+)$/);
    if (t) {
      const id = t[1];
      const show = await fetchJSON<any>(`https://api.themoviedb.org/3/tv/${id}?api_key=${apiKey()}`);
      if (!show?.id) return [];
      const poster = show.poster_path ? IMG + show.poster_path : undefined;
      const runtime = show.episode_run_time?.[0] || 45;
      const cutoff = Date.now() - 2 * 86400_000;
      const seasons: any[] = (show.seasons || [])
        .filter((s: any) => s.season_number > 0)
        .sort((a: any, b: any) => b.season_number - a.season_number)
        .slice(0, 2);
      const out: NormalizedEvent[] = [];
      for (const meta of seasons) {
        const season = await fetchJSON<any>(`https://api.themoviedb.org/3/tv/${id}/season/${meta.season_number}?api_key=${apiKey()}`).catch(() => null);
        for (const ep of season?.episodes || []) {
          if (!ep.air_date) continue;
          const start = new Date(`${ep.air_date}T00:00:00Z`);
          if (start.getTime() < cutoff) continue;
          out.push({
            extId: `tmdb-tv-${id}-${ep.season_number}-${ep.episode_number}`,
            title: `${show.name} S${ep.season_number}E${ep.episode_number}${ep.name ? ` — ${ep.name}` : ""}`,
            start: start.toISOString(),
            durationMin: runtime,
            note: "TV episode",
            imageUrl: poster,
            url: `https://www.themoviedb.org/tv/${id}`,
          });
        }
      }
      return out;
    }
    return [];
  },

  async search(query: string): Promise<CatalogItem[]> {
    if (!apiKey() || query.trim().length < 2) return [];
    const q = encodeURIComponent(query);
    const [movies, shows] = await Promise.allSettled([
      fetchJSON<any>(`https://api.themoviedb.org/3/search/movie?api_key=${apiKey()}&query=${q}`),
      fetchJSON<any>(`https://api.themoviedb.org/3/search/tv?api_key=${apiKey()}&query=${q}`),
    ]);

    const movieItems: CatalogItem[] =
      movies.status === "fulfilled"
        ? (movies.value?.results || [])
            .filter((m: any) => m.release_date)
            .slice(0, 6)
            .map((m: any): CatalogItem => ({
              provider: "tmdb",
              ref: `movie/${m.id}`,
              label: m.title,
              sublabel: `Movie · releases ${m.release_date}`,
              categorySlug: "screen",
              imageUrl: m.poster_path ? IMG + m.poster_path : undefined,
            }))
        : [];

    const tvItems: CatalogItem[] =
      shows.status === "fulfilled"
        ? (shows.value?.results || [])
            .filter((s: any) => s.first_air_date)
            .slice(0, 6)
            .map((s: any): CatalogItem => ({
              provider: "tmdb",
              ref: `tv/${s.id}`,
              label: s.name,
              sublabel: `TV · ${String(s.first_air_date).slice(0, 4)}`,
              categorySlug: "screen",
              imageUrl: s.poster_path ? IMG + s.poster_path : undefined,
            }))
        : [];

    return [...tvItems, ...movieItems];
  },
};
