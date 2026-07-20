"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, Flag, Loader2, Plus, Radio, Trophy } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/client/api";
import type { CatalogItem, LeagueProfile, ScoreGame } from "@/lib/client/types";

function ResultRow({ g }: { g: ScoreGame }) {
  const live = g.state === "in";
  const done = g.state === "post";
  const label = g.name || [g.away?.name, g.home?.name].filter(Boolean).join(" v ") || "Event";
  const score =
    g.home?.score != null && g.away?.score != null && (g.away.score !== "" || g.home.score !== "")
      ? `${g.away.abbr} ${g.away.score}–${g.home.score} ${g.home.abbr}`
      : g.winner
        ? `🏆 ${g.winner}`
        : "";
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm">
      <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold ${live ? "text-red-400" : "text-muted-foreground"}`}>
        {live ? <Radio className="size-3 animate-pulse" /> : <Flag className="size-3" />}
        {g.detail || (done ? "Final" : "")}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {score && <span className="tabular shrink-0 text-xs text-muted-foreground">{score}</span>}
    </div>
  );
}

// Mounted only while a league is open, so it fetches once on open (no synchronous effect churn).
function ProfileBody({ item }: { item: CatalogItem }) {
  const [profile, setProfile] = useState<LeagueProfile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .leagueProfile(item.provider, item.ref)
      .then((p) => active && setProfile(p))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [item.provider, item.ref]);

  const description = profile?.description ?? item.description;

  return (
    <div className="flex flex-col gap-5 px-4 pb-8">
      {/* Identity */}
      <div className="flex items-start gap-3">
        {profile?.logo || item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile?.logo || item.imageUrl} alt="" className="size-14 shrink-0 rounded-xl bg-secondary object-contain p-1" />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-secondary text-2xl">🏟️</span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold leading-tight tracking-tight">{item.label}</h2>
          {item.sublabel && <p className="mt-0.5 text-sm text-muted-foreground">{item.sublabel}</p>}
        </div>
      </div>

      {/* Description */}
      {description ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : !profile && !failed ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : null}

      {/* Meta chips */}
      {profile && (profile.meta.length > 0 || profile.website) && (
        <div className="flex flex-wrap gap-2">
          {profile.meta.map((m) => (
            <span key={m.label} className="rounded-full bg-secondary px-2.5 py-1 text-xs">
              <span className="text-muted-foreground">{m.label}:</span> <span className="font-medium">{m.value}</span>
            </span>
          ))}
          {profile.website && (
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
            >
              Official site <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}

      {/* Loading skeletons for the data sections */}
      {!profile && !failed && <Skeleton className="h-40 rounded-xl" />}

      {/* Standings */}
      {profile && profile.standings.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Trophy className="size-3.5" /> {profile.standingsTitle}
          </h3>
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
            <div className="divide-y divide-border/50">
              {profile.standings.slice(0, 15).map((row) => (
                <div key={row.team + row.rank} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">{row.rank}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {row.logo && <img src={row.logo} alt="" className="size-5 shrink-0 object-contain" />}
                  <span className="min-w-0 flex-1 truncate">{row.team}</span>
                  {row.record && <span className="tabular shrink-0 text-xs text-muted-foreground">{row.record}</span>}
                  {row.points && <span className="tabular w-10 shrink-0 text-right font-semibold">{row.points}</span>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Recent & upcoming */}
      {profile && profile.results.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Flag className="size-3.5" /> Recent &amp; upcoming
          </h3>
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
            <div className="divide-y divide-border/50">
              {profile.results.map((g) => (
                <ResultRow key={g.id} g={g} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Past champions */}
      {profile && profile.champions.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Trophy className="size-3.5" /> Past champions
          </h3>
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
            <div className="divide-y divide-border/50">
              {profile.champions.map((c) => (
                <div key={c.season} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="tabular w-12 shrink-0 text-xs font-semibold text-muted-foreground">{c.season}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export function LeagueProfileSheet({
  item,
  followed,
  adding,
  onOpenChange,
  onFollow,
  onUnfollow,
}: {
  item: CatalogItem | null;
  followed: boolean;
  adding: boolean;
  onOpenChange: (open: boolean) => void;
  onFollow: (item: CatalogItem) => void;
  onUnfollow: (item: CatalogItem) => void;
}) {
  return (
    <Sheet open={!!item} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-xl overflow-y-auto rounded-t-2xl p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>{item?.label ?? "League"}</SheetTitle>
        </SheetHeader>
        {item && <ProfileBody item={item} />}
        {/* Sticky follow action */}
        {item && (
          <div className="sticky bottom-0 border-t border-border/60 bg-background/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
            {followed ? (
              <button
                onClick={() => onUnfollow(item)}
                disabled={adding}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 py-2.5 text-sm font-semibold text-primary transition hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
              >
                {adding ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Following — tap to unfollow
              </button>
            ) : (
              <button
                onClick={() => onFollow(item)}
                disabled={adding}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Follow
              </button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
