"use client";

import { useMemo } from "react";
import { CalendarCheck, CheckCircle2, Clock, Flame } from "lucide-react";
import type { StateBundle, ClientEvent } from "@/lib/client/types";
import { fmtDay } from "@/lib/domain/format";

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <div className="surface flex flex-col gap-1 rounded-2xl border border-border/70 bg-card p-4">
      <span className="text-primary/80">{icon}</span>
      <span className="tabular text-2xl font-bold tracking-tight">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// Monday 00:00 of the week containing d (local time).
function weekStart(d: Date): number {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - dow);
  return x.getTime();
}

export function ProfileView({ state, onOpenEvent }: { state: StateBundle; onOpenEvent: (ev: ClientEvent) => void }) {
  const { user, events, categories, follows } = state;
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const stats = useMemo(() => {
    const watched = events.filter((e) => e.watchedAt);
    const now = new Date();

    const monthCount = watched.filter((e) => {
      const d = new Date(e.watchedAt!);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const minutes = watched.reduce((n, e) => n + (e.allDay ? 0 : e.durationMin || 0), 0);

    // Watched-by-category (all-time) for the bar list.
    const byCat = new Map<string, number>();
    for (const e of watched) {
      const k = e.categoryId ?? "none";
      byCat.set(k, (byCat.get(k) ?? 0) + 1);
    }
    const topCats = [...byCat.entries()]
      .map(([id, count]) => ({ cat: catById.get(id), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // This month's top category (for the recap sentence).
    const monthByCat = new Map<string, number>();
    for (const e of watched) {
      const d = new Date(e.watchedAt!);
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
        const k = e.categoryId ?? "none";
        monthByCat.set(k, (monthByCat.get(k) ?? 0) + 1);
      }
    }
    const monthTop = [...monthByCat.entries()].sort((a, b) => b[1] - a[1])[0];
    const monthTopCat = monthTop ? catById.get(monthTop[0]) : undefined;

    // Last 12 calendar months of watch activity.
    const months: { label: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const count = watched.filter((e) => {
        const w = new Date(e.watchedAt!);
        return w.getFullYear() === d.getFullYear() && w.getMonth() === d.getMonth();
      }).length;
      months.push({ label: d.toLocaleDateString(undefined, { month: "short" }), count });
    }
    const maxMonth = Math.max(1, ...months.map((m) => m.count));

    // Weekly streak: consecutive weeks (ending this week) with ≥1 watched.
    const weeks = new Set(watched.map((e) => weekStart(new Date(e.watchedAt!))));
    let streak = 0;
    let cursor = weekStart(now);
    while (weeks.has(cursor)) {
      streak++;
      cursor -= 7 * 86400_000;
    }

    const recent = [...watched]
      .sort((a, b) => new Date(b.watchedAt!).getTime() - new Date(a.watchedAt!).getTime())
      .slice(0, 12);

    return {
      total: watched.length,
      monthCount,
      hours: Math.round(minutes / 60),
      streak,
      topCats,
      recent,
      months,
      maxMonth,
      monthTopCat,
      maxCat: topCats[0]?.count ?? 1,
    };
  }, [events, catById]);

  const name = user.displayName || user.email.split("@")[0];
  const initial = (name[0] || "?").toUpperCase();
  const monthLabel = new Date().toLocaleDateString(undefined, { month: "long" });

  return (
    <div className="flex flex-col gap-6 pb-4">
      {/* Identity */}
      <div className="flex items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-violet-500 text-2xl font-bold text-white">
          {initial}
        </span>
        <div className="min-w-0">
          <div className="truncate text-lg font-bold tracking-tight">{name}</div>
          <div className="truncate text-sm text-muted-foreground">
            Tracking {events.length} · {follows.length} source{follows.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard icon={<CheckCircle2 className="size-4" />} value={stats.total} label="Watched" />
        <StatCard icon={<Clock className="size-4" />} value={`${stats.hours}h`} label="Time watched" />
        <StatCard icon={<CalendarCheck className="size-4" />} value={stats.monthCount} label="This month" />
        <StatCard icon={<Flame className="size-4" />} value={stats.streak > 0 ? `${stats.streak}w` : "—"} label="Week streak" />
      </div>

      {stats.total === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/70 py-10 text-center">
          <div className="text-3xl">👀</div>
          <h3 className="font-semibold">No watch history yet</h3>
          <p className="mx-auto max-w-xs text-sm text-muted-foreground">
            Open any event and tap <b>Mark as watched</b> — your games, races and shows build up your stats here.
          </p>
        </div>
      ) : (
        <>
          {/* Recap */}
          <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary/80">{monthLabel} so far</div>
            <p className="mt-1 text-sm">
              {stats.monthCount === 0 ? (
                <>Nothing watched yet this month — a good week to change that.</>
              ) : (
                <>
                  <b>{stats.monthCount}</b> watched this month
                  {stats.monthTopCat ? (
                    <>
                      , mostly <b>{stats.monthTopCat.emoji} {stats.monthTopCat.name}</b>
                    </>
                  ) : null}
                  {stats.streak > 1 ? <> · {stats.streak}-week streak 🔥</> : null}.
                </>
              )}
            </p>
          </div>

          {/* 12-month activity */}
          <div className="flex flex-col gap-2">
            <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last 12 months</h3>
            <div className="flex items-end justify-between gap-1.5 rounded-2xl border border-border/70 bg-card p-4">
              {stats.months.map((m, i) => (
                <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-24 w-full items-end">
                    <div
                      className="w-full rounded-md bg-primary/80"
                      style={{ height: `${m.count ? Math.max(6, (m.count / stats.maxMonth) * 100) : 3}%`, opacity: m.count ? 1 : 0.25 }}
                      title={`${m.count} watched`}
                    />
                  </div>
                  <span className="truncate text-[10px] text-muted-foreground">{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* By category */}
          <div className="flex flex-col gap-2">
            <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Most watched</h3>
            <div className="flex flex-col gap-2.5 rounded-2xl border border-border/70 bg-card p-4">
              {stats.topCats.map(({ cat, count }) => (
                <div key={cat?.id ?? "none"} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-sm">{cat ? `${cat.emoji} ${cat.name}` : "Uncategorized"}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(8, (count / stats.maxCat) * 100)}%`, background: cat?.color ?? "var(--primary)" }}
                    />
                  </div>
                  <span className="tabular w-6 shrink-0 text-right text-sm font-semibold">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recently watched */}
          <div className="flex flex-col gap-2">
            <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recently watched</h3>
            <div className="flex flex-col gap-2">
              {stats.recent.map((e) => {
                const cat = e.categoryId ? catById.get(e.categoryId) : undefined;
                return (
                  <button
                    key={e.id}
                    onClick={() => onOpenEvent(e)}
                    className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3 text-left transition hover:border-border"
                  >
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-lg text-sm"
                      style={{ background: `color-mix(in oklch, ${cat?.color ?? "var(--primary)"} 18%, transparent)` }}
                    >
                      {cat?.emoji ?? "✓"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{e.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{cat?.name ?? "Event"}</div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{fmtDay(new Date(e.watchedAt!))}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      <p className="pt-1 text-center text-xs text-muted-foreground">Your data is private to your account.</p>
    </div>
  );
}
