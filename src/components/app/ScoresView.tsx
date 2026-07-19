"use client";

import { useEffect, useState } from "react";
import { Loader2, Newspaper, Trophy, Radio } from "lucide-react";
import { api } from "@/lib/client/api";
import type { LeagueOverview, ScoreGame, ScoreTeam } from "@/lib/client/types";

function TeamLine({ team, winner }: { team?: ScoreTeam; winner: boolean }) {
  if (!team) return null;
  return (
    <div className="flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {team.logo ? <img src={team.logo} alt="" className="size-5 shrink-0 object-contain" /> : <span className="size-5 shrink-0" />}
      <span className={`min-w-0 flex-1 truncate text-sm ${winner ? "font-semibold" : ""}`}>{team.name || team.abbr}</span>
      <span className={`tabular shrink-0 text-sm ${winner ? "font-bold" : "text-muted-foreground"}`}>{team.score}</span>
    </div>
  );
}

function GameCard({ game }: { game: ScoreGame }) {
  const live = game.state === "in";
  const done = game.state === "post";
  const hs = Number(game.home?.score ?? "");
  const as = Number(game.away?.score ?? "");
  const homeWon = done && !Number.isNaN(hs) && !Number.isNaN(as) && hs > as;
  const awayWon = done && !Number.isNaN(hs) && !Number.isNaN(as) && as > hs;
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-xl border bg-card p-3 ${live ? "border-red-500/40" : "border-border/70"} ${game.favorite ? "ring-1 ring-primary/50" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${live ? "text-red-400" : "text-muted-foreground"}`}>
          {live && <Radio className="size-3 animate-pulse" />}
          {game.detail || (game.state === "pre" ? "Upcoming" : "")}
        </span>
        {game.favorite && <span className="text-[11px] font-semibold text-primary">★</span>}
      </div>
      <TeamLine team={game.away} winner={awayWon} />
      <TeamLine team={game.home} winner={homeWon} />
    </div>
  );
}

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
          Follow a team or league in Discover to see scores, standings and news here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7 pb-4">
      {leagues.map((lg) => (
        <div key={lg.ref} className="flex flex-col gap-3">
          <h2 className="px-1 text-base font-bold tracking-tight">{lg.label}</h2>

          {lg.scores.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Radio className="size-3.5" /> Scores
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {lg.scores.map((g) => (
                  <GameCard key={g.id} game={g} />
                ))}
              </div>
            </div>
          )}

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
