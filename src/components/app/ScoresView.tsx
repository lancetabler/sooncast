"use client";

import { useEffect, useState } from "react";
import { Loader2, Newspaper, Trophy } from "lucide-react";
import { api } from "@/lib/client/api";
import type { LeagueOverview } from "@/lib/client/types";

export function ScoresView() {
  const [leagues, setLeagues] = useState<LeagueOverview[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .sportsOverview()
      .then((r) => setLeagues(r.leagues))
      .catch(() => setLeagues([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (!leagues?.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <div className="text-4xl">🏆</div>
        <h3 className="font-semibold">No leagues yet</h3>
        <p className="mx-auto max-w-xs text-sm text-muted-foreground">
          Follow a team or league in Discover to see standings and news here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      {leagues.map((lg) => (
        <div key={lg.ref} className="flex flex-col gap-3">
          <h2 className="px-1 text-base font-bold tracking-tight">{lg.label}</h2>

          {lg.standings.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
              <div className="flex items-center gap-1.5 border-b border-border/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Trophy className="size-3.5" /> Standings
              </div>
              <div className="divide-y divide-border/50">
                {lg.standings.slice(0, 10).map((row) => (
                  <div
                    key={row.team + row.rank}
                    className={`flex items-center gap-2 px-3 py-2 text-sm ${row.highlight ? "bg-primary/10" : ""}`}
                  >
                    <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">{row.rank}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {row.logo && <img src={row.logo} alt="" className="size-5 shrink-0 object-contain" />}
                    <span className={`min-w-0 flex-1 truncate ${row.highlight ? "font-semibold" : ""}`}>{row.team}</span>
                    {row.record && <span className="tabular shrink-0 text-xs text-muted-foreground">{row.record}</span>}
                    {row.points && <span className="tabular w-8 shrink-0 text-right font-semibold">{row.points}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {lg.news.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Newspaper className="size-3.5" /> News
              </div>
              {lg.news.map((n, i) => (
                <a
                  key={i}
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-3 rounded-xl border border-border/70 bg-card p-3 transition hover:border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {n.image && <img src={n.image} alt="" className="size-14 shrink-0 rounded-lg object-cover" />}
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm font-semibold">{n.headline}</div>
                    {n.description && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.description}</div>}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
