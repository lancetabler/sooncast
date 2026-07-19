"use client";

import { useEffect, useState } from "react";
import { Newspaper, Trophy, Radio, Flag } from "lucide-react";
import { api } from "@/lib/client/api";
import { Skeleton } from "@/components/ui/skeleton";
import type { LeagueOverview, LiveBoard, ScoreGame, ScoreTeam } from "@/lib/client/types";

function TeamLine({ team, winner }: { team?: ScoreTeam; winner: boolean }) {
  if (!team) return null;
  return (
    <div className="flex items-center gap-2">
      {team.logo ? <img src={team.logo} alt="" className="size-5 shrink-0 object-contain" /> : <span className="size-5 shrink-0" />}
      <span className={`min-w-0 flex-1 truncate text-sm ${winner ? "font-semibold" : ""}`}>{team.name || team.abbr}</span>
      <span className={`tabular shrink-0 text-sm ${winner ? "font-bold" : "text-muted-foreground"}`}>{team.score}</span>
    </div>
  );
}

function GameCard({ game }: { game: ScoreGame }) {
  const live = game.state === "in";
  const done = game.state === "post";

  // Race / tournament / fight-card variant: one named event, optional winner.
  if (game.name && !game.home && !game.away) {
    return (
      <div className={`surface flex flex-col gap-1.5 rounded-xl border bg-card p-3 ${live ? "border-red-500/40" : "border-border/70"}`}>
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${live ? "text-red-400" : "text-muted-foreground"}`}>
          {live ? <Radio className="size-3 animate-pulse" /> : <Flag className="size-3" />}
          {game.detail || (game.state === "pre" ? "Upcoming" : "")}
        </span>
        <div className="text-sm font-semibold leading-snug">{game.name}</div>
        {done && game.winner && <div className="text-xs text-muted-foreground">🏆 {game.winner}</div>}
      </div>
    );
  }

  const hs = Number(game.home?.score ?? "");
  const as = Number(game.away?.score ?? "");
  const homeWon = done && !Number.isNaN(hs) && !Number.isNaN(as) && hs > as;
  const awayWon = done && !Number.isNaN(hs) && !Number.isNaN(as) && as > hs;
  return (
    <div
      className={`surface flex flex-col gap-1.5 rounded-xl border bg-card p-3 ${live ? "border-red-500/40" : "border-border/70"} ${game.favorite ? "ring-1 ring-primary/50" : ""}`}
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

// Real-time running order while a race/session is on track (OpenF1, NASCAR live feed).
function LiveBoardCard({ board }: { board: LiveBoard }) {
  return (
    <div className="overflow-hidden rounded-xl border border-red-500/40 bg-card">
      <div className="flex items-center gap-1.5 border-b border-border/60 px-3 py-2 text-xs font-semibold">
        <Radio className="size-3.5 animate-pulse text-red-400" />
        <span className="text-red-400">LIVE</span>
        <span className="min-w-0 truncate text-muted-foreground">{board.title}</span>
      </div>
      <div className="divide-y divide-border/50">
        {board.rows.map((r) => (
          <div key={`${r.pos}-${r.name}`} className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">{r.pos}</span>
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            {r.detail && <span className="tabular shrink-0 text-xs text-muted-foreground">{r.detail}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function StandingsTable({ lg }: { lg: LeagueOverview }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <div className="divide-y divide-border/50">
        {lg.standings.map((row) => (
          <div
            key={row.team + row.rank}
            className={`flex items-center gap-2 px-3 py-2 text-sm ${row.highlight ? "bg-primary/10" : ""}`}
          >
            <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">{row.rank}</span>
            {row.logo && <img src={row.logo} alt="" className="size-5 shrink-0 object-contain" />}
            <span className={`min-w-0 flex-1 truncate ${row.highlight ? "font-semibold" : ""}`}>{row.team}</span>
            {row.record && <span className="tabular shrink-0 text-xs text-muted-foreground">{row.record}</span>}
            {row.points && <span className="tabular w-10 shrink-0 text-right font-semibold">{row.points}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function LeagueHeader({ label }: { label: string }) {
  return <h2 className="px-1 text-base font-bold tracking-tight">{label}</h2>;
}

function EmptyTab({ emoji, title, hint }: { emoji: string; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="text-4xl">{emoji}</div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mx-auto max-w-xs text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

type ScoresTab = "scores" | "standings" | "news";
const TABS: Array<{ id: ScoresTab; label: string; icon: typeof Radio }> = [
  { id: "scores", label: "Scores", icon: Radio },
  { id: "standings", label: "Standings", icon: Trophy },
  { id: "news", label: "News", icon: Newspaper },
];

// Module-level cache so re-opening the Scores tab is instant, then refreshes silently.
let scoresCache: { at: number; leagues: LeagueOverview[] } | null = null;
let lastTab: ScoresTab = "scores";
const rememberTab = (t: ScoresTab) => {
  lastTab = t;
};

export function ScoresView() {
  const [leagues, setLeagues] = useState<LeagueOverview[] | null>(
    () => (scoresCache && Date.now() - scoresCache.at < 90_000 ? scoresCache.leagues : null)
  );
  const [loading, setLoading] = useState(!leagues);
  const [tab, setTab] = useState<ScoresTab>(lastTab);

  function switchTab(t: ScoresTab) {
    rememberTab(t);
    setTab(t);
  }

  useEffect(() => {
    let active = true;
    api
      .sportsOverview()
      .then((r) => {
        if (!active) return;
        scoresCache = { at: Date.now(), leagues: r.leagues };
        setLeagues(r.leagues);
      })
      .catch(() => {
        if (active) setLeagues((prev) => prev ?? []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-5 pb-4">
        <Skeleton className="h-10 rounded-full" />
        {[0, 1].map((s) => (
          <div key={s} className="flex flex-col gap-3">
            <Skeleton className="h-5 w-32" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Skeleton className="h-[68px] rounded-xl" />
              <Skeleton className="h-[68px] rounded-xl" />
            </div>
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  if (!leagues?.length) {
    return (
      <EmptyTab emoji="🏆" title="No leagues yet" hint="Follow a team or league in Discover to see scores, standings and news here." />
    );
  }

  const withScores = leagues.filter((l) => l.scores.length > 0 || l.live);
  const withStandings = leagues.filter((l) => l.standings.length > 0);
  const withNews = leagues.filter((l) => l.news.length > 0);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="sticky top-14 z-10 -mx-1 bg-background/80 px-1 py-1 backdrop-blur">
        <div className="flex rounded-full border border-border/70 bg-card p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => switchTab(id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-semibold transition ${
                tab === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "scores" &&
        (withScores.length === 0 ? (
          <EmptyTab emoji="📡" title="Nothing on right now" hint="Live games, upcoming fixtures and recent results show here on game days." />
        ) : (
          withScores.map((lg) => (
            <div key={lg.ref} className="flex flex-col gap-2.5">
              <LeagueHeader label={lg.label} />
              {lg.live && <LiveBoardCard board={lg.live} />}
              {lg.scores.length > 0 && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {lg.scores.map((g) => (
                    <GameCard key={g.id} game={g} />
                  ))}
                </div>
              )}
            </div>
          ))
        ))}

      {tab === "standings" &&
        (withStandings.length === 0 ? (
          <EmptyTab emoji="🏆" title="No standings yet" hint="Standings, championship points and world rankings show here once a season is underway." />
        ) : (
          withStandings.map((lg) => (
            <div key={lg.ref} className="flex flex-col gap-2.5">
              <LeagueHeader label={lg.label} />
              <StandingsTable lg={lg} />
            </div>
          ))
        ))}

      {tab === "news" &&
        (withNews.length === 0 ? (
          <EmptyTab emoji="📰" title="No news yet" hint="Headlines from your followed leagues show here." />
        ) : (
          withNews.map((lg) => (
            <div key={lg.ref} className="flex flex-col gap-2.5">
              <LeagueHeader label={lg.label} />
              {lg.news.map((n, i) => (
                <a
                  key={i}
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-3 rounded-xl border border-border/70 bg-card p-3 transition hover:border-border"
                >
                  {n.image && <img src={n.image} alt="" className="size-14 shrink-0 rounded-lg object-cover" />}
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm font-semibold">{n.headline}</div>
                    {n.description && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.description}</div>}
                  </div>
                </a>
              ))}
            </div>
          ))
        ))}
    </div>
  );
}
