import { fetchJSON, type CatalogItem, type NormalizedEvent, type SourceProvider } from "./types";

// Movie & TV release dates via TMDB. Requires TMDB_API_KEY (v3). Degrades to empty if unset.
function apiKey() {
  return process.env.TMDB_API_KEY || "";
}
const IMG = "https://image.tmdb.org/t/p/w200";

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
    return [];
  },

  async search(query: string): Promise<CatalogItem[]> {
    if (!apiKey() || query.trim().length < 2) return [];
    const data = await fetchJSON<any>(
      `https://api.themoviedb.org/3/search/movie?api_key=${apiKey()}&query=${encodeURIComponent(query)}`
    );
    return (data?.results || [])
      .filter((m: any) => m.release_date)
      .slice(0, 8)
      .map((m: any): CatalogItem => ({
        provider: "tmdb",
        ref: `movie/${m.id}`,
        label: m.title,
        sublabel: `Releases ${m.release_date}`,
        categorySlug: "screen",
        imageUrl: m.poster_path ? IMG + m.poster_path : undefined,
      }));
  },
};
