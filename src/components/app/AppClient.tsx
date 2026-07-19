"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Compass, ListChecks, Plus, Search, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client/api";
import { registerServiceWorker, setBadge } from "@/lib/client/push";
import { occurrences } from "@/lib/client/occurrences";
import { groupFor, sameDay, preciseCountdown, fmtDay, fmtTime, type GroupLabel } from "@/lib/domain/format";
import type { Occurrence } from "@/lib/domain/types";
import type { ClientEvent, StateBundle, LiveStatus } from "@/lib/client/types";
import { EventCard } from "./EventCard";
import { EventDialog } from "./EventDialog";
import { EventDetail } from "./EventDetail";
import { Discover } from "./Discover";
import { CalendarView } from "./CalendarView";
import { SettingsView } from "./SettingsView";
import { Onboarding } from "./Onboarding";
import { InstallPrompt } from "./InstallPrompt";
import { Input } from "@/components/ui/input";

type View = "upcoming" | "calendar" | "discover" | "settings";
const GROUP_ORDER: GroupLabel[] = ["Live", "Today", "Tomorrow", "This week", "Later"];

export default function AppClient({ initial }: { initial: StateBundle }) {
  const router = useRouter();
  const [state, setState] = useState<StateBundle>(initial);
  const [view, setView] = useState<View>("upcoming");
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [editing, setEditing] = useState<ClientEvent | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [detail, setDetail] = useState<ClientEvent | null>(null);
  const [showOnboard, setShowOnboard] = useState(false);
  const [liveMap, setLiveMap] = useState<Record<string, LiveStatus>>({});

  const catById = useMemo(() => new Map(state.categories.map((c) => [c.id, c])), [state.categories]);

  const refresh = useCallback(async () => {
    try {
      setState(await api.state());
    } catch {
      /* keep last state */
    }
  }, []);

  // countdown ticker
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // register SW + first-run onboarding
  useEffect(() => {
    registerServiceWorker();
    const onboarded = typeof localStorage !== "undefined" && localStorage.getItem("radarr_onboarded");
    if (!onboarded && state.events.length === 0 && state.follows.length === 0) setShowOnboard(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // home-screen badge = events starting in the next 24h
  useEffect(() => {
    const soon = occurrences(state.events, new Date(now), new Date(now + 86400_000)).length;
    setBadge(soon);
  }, [state.events, now]);

  // poll live scores/status for ESPN games happening today
  useEffect(() => {
    const today = new Date();
    const ids = state.events
      .filter((e) => e.sourceProvider === "espn" && sameDay(new Date(e.start), today))
      .map((e) => e.id);
    if (!ids.length) {
      setLiveMap({});
      return;
    }
    let active = true;
    const poll = async () => {
      try {
        const m = await api.live(ids);
        if (active) setLiveMap(m);
      } catch {
        /* ignore */
      }
    };
    poll();
    const t = setInterval(poll, 30_000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [state.events]);

  const upcoming = useMemo(() => {
    const from = new Date(now - 3 * 3600_000);
    const to = new Date(now + 400 * 86400_000);
    const occ = occurrences(state.events, from, to, { categoryId: filter, search });
    const groups = new Map<GroupLabel, Occurrence[]>();
    for (const o of occ) {
      const g = groupFor(o.start, o.end, new Date(now));
      (groups.get(g) ?? groups.set(g, []).get(g)!).push(o);
    }
    return groups;
  }, [state.events, filter, search, now]);

  const usedCategories = useMemo(() => {
    const ids = new Set(state.events.map((e) => e.categoryId));
    return state.categories.filter((c) => ids.has(c.id));
  }, [state.events, state.categories]);

  const nextUp = useMemo(() => {
    for (const g of ["Today", "Tomorrow", "This week", "Later"] as GroupLabel[]) {
      const items = upcoming.get(g);
      const fut = items?.find((o) => o.start.getTime() > now);
      if (fut) return fut;
    }
    return null;
  }, [upcoming, now]);

  // occurrences whose time overlaps another (timed events only)
  const clashKeys = useMemo(() => {
    const all = [...upcoming.values()].flat().filter((o) => !o.event.allDay && !o.event.countUp);
    const set = new Set<string>();
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (all[i].start < all[j].end && all[j].start < all[i].end) {
          set.add(all[i].key);
          set.add(all[j].key);
        }
      }
    }
    return set;
  }, [upcoming]);

  function openEvent(occ: Occurrence) {
    const ev = state.events.find((e) => e.id === occ.event.id);
    if (ev) setDetail(ev);
  }
  function newEvent() {
    setEditing(null);
    setShowEventDialog(true);
  }
  function editEvent(ev: ClientEvent) {
    setDetail(null);
    setEditing(ev);
    setShowEventDialog(true);
  }
  async function logout() {
    await api.logout().catch(() => {});
    router.refresh();
  }

  const totalUpcoming = [...upcoming.values()].reduce((n, arr) => n + arr.length, 0);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col pb-24">
      {/* Header */}
      <header className="radarr-glow sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/60 bg-background/80 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-violet-500 text-white">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" opacity=".35" />
              <circle cx="12" cy="12" r="5" opacity=".6" />
              <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
              <path d="M12 12 L20 6" />
            </svg>
          </span>
          <span className="text-lg font-bold tracking-tight">Radarr</span>
        </div>
        {(view === "upcoming" || view === "calendar") && (
          <button onClick={() => setShowSearch((s) => !s)} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary" aria-label="Search">
            {showSearch ? <X className="size-5" /> : <Search className="size-5" />}
          </button>
        )}
      </header>

      {showSearch && (view === "upcoming" || view === "calendar") && (
        <div className="px-4 pt-3">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search everything you track…" autoFocus />
        </div>
      )}

      {/* Category filter chips */}
      {(view === "upcoming" || view === "calendar") && usedCategories.length > 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
          <Chip active={filter === "all"} onClick={() => setFilter("all")} label="All" />
          {usedCategories.map((c) => (
            <Chip key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)} label={`${c.emoji} ${c.name}`} color={c.color} />
          ))}
        </div>
      )}

      {/* Main */}
      <main className="flex-1 px-4 py-2">
        {view === "upcoming" && (
          totalUpcoming === 0 ? (
            <EmptyState
              hasEvents={state.events.length > 0}
              onAdd={newEvent}
              onDiscover={() => setView("discover")}
            />
          ) : (
            <div className="flex flex-col gap-1">
              {nextUp && !search && (
                <UpNextHero occ={nextUp} category={catById.get(nextUp.event.categoryId ?? "")} now={now} onOpen={() => openEvent(nextUp)} />
              )}
              {GROUP_ORDER.map((g) => {
                const items = upcoming.get(g);
                if (!items?.length) return null;
                return (
                  <section key={g} className="mb-3">
                    <h2 className="mb-2 mt-4 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {g} <span className="text-muted-foreground/60">· {items.length}</span>
                    </h2>
                    <div className="flex flex-col gap-2">
                      {items.map((occ) => (
                        <EventCard
                          key={occ.key}
                          occ={occ}
                          category={catById.get(occ.event.categoryId ?? "")}
                          now={now}
                          reminders={occ.event.reminders.length}
                          live={liveMap[occ.event.id]}
                          clash={clashKeys.has(occ.key)}
                          onOpen={() => openEvent(occ)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )
        )}

        {view === "calendar" && (
          <CalendarView events={state.events} categories={state.categories} filter={filter} now={now} live={liveMap} onOpen={openEvent} />
        )}
        {view === "discover" && <Discover categories={state.categories} onChanged={refresh} />}
        {view === "settings" && (
          <SettingsView state={state} onChanged={refresh} onLogout={logout} />
        )}
      </main>

      {/* FAB */}
      {(view === "upcoming" || view === "calendar") && (
        <button
          onClick={newEvent}
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-[max(1rem,calc(50vw-21rem))] z-40 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-xl shadow-primary/30 active:scale-95"
          aria-label="Add"
        >
          <Plus className="size-7" strokeWidth={2.4} />
        </button>
      )}

      {/* Bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-2xl border-t border-border/60 bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <Tab icon={<ListChecks className="size-5" />} label="Upcoming" active={view === "upcoming"} onClick={() => setView("upcoming")} />
        <Tab icon={<CalendarDays className="size-5" />} label="Calendar" active={view === "calendar"} onClick={() => setView("calendar")} />
        <Tab icon={<Compass className="size-5" />} label="Discover" active={view === "discover"} onClick={() => setView("discover")} />
        <Tab icon={<Settings2 className="size-5" />} label="Settings" active={view === "settings"} onClick={() => setView("settings")} />
      </nav>

      {/* Dialogs */}
      <EventDialog
        open={showEventDialog}
        onOpenChange={setShowEventDialog}
        event={editing}
        categories={state.categories}
        defaultReminders={state.user.defaultReminders}
        onSaved={refresh}
      />
      <EventDetail
        event={detail}
        category={detail ? catById.get(detail.categoryId ?? "") : undefined}
        onOpenChange={(v) => !v && setDetail(null)}
        onEdit={editEvent}
      />
      <InstallPrompt />
      <Onboarding
        open={showOnboard}
        onOpenChange={setShowOnboard}
        onDone={() => {
          localStorage.setItem("radarr_onboarded", "1");
          refresh();
        }}
      />
    </div>
  );
}

function UpNextHero({ occ, category, now, onOpen }: { occ: Occurrence; category?: { emoji: string; name: string; color: string }; now: number; onOpen: () => void }) {
  const color = category?.color ?? "var(--primary)";
  const { d, h, m, s } = preciseCountdown(occ.start.getTime() - now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <button
      onClick={onOpen}
      className="mb-3 mt-1 flex w-full flex-col gap-2 overflow-hidden rounded-2xl border border-border/70 bg-card p-4 text-left"
      style={{ background: `linear-gradient(135deg, color-mix(in oklch, ${color} 14%, var(--card)), var(--card))` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Up next</span>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color }}>
          {category?.emoji} {category?.name}
        </span>
      </div>
      <div className="truncate text-lg font-bold tracking-tight">{occ.event.title}</div>
      <div className="tabular flex items-end gap-1 text-3xl font-bold leading-none" style={{ color }}>
        {d > 0 && <span>{d}<span className="text-base font-semibold text-muted-foreground">d</span> </span>}
        <span>{pad(h)}:{pad(m)}:{pad(s)}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {fmtDay(occ.start)}{occ.event.allDay ? "" : ` · ${fmtTime(occ.start)}`}
      </div>
    </button>
  );
}

function Chip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition"
      style={{
        borderColor: active ? (color ?? "var(--primary)") : "var(--border)",
        background: active ? `color-mix(in oklch, ${color ?? "var(--primary)"} 18%, transparent)` : "transparent",
        color: active ? "var(--foreground)" : "var(--muted-foreground)",
      }}
    >
      {label}
    </button>
  );
}

function Tab({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium transition ${active ? "text-primary" : "text-muted-foreground"}`}
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyState({ hasEvents, onAdd, onDiscover }: { hasEvents: boolean; onAdd: () => void; onDiscover: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <div className="text-5xl">{hasEvents ? "🔭" : "📡"}</div>
      <div>
        <h3 className="font-semibold">{hasEvents ? "Nothing coming up here" : "Nothing on the horizon yet"}</h3>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
          {hasEvents
            ? "Try a different filter or clear your search."
            : "Follow your teams and series, or add your own — races, games, drops, deadlines."}
        </p>
      </div>
      {!hasEvents && (
        <div className="flex gap-2">
          <button onClick={onDiscover} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Browse sources
          </button>
          <button onClick={onAdd} className="rounded-full border border-border px-4 py-2 text-sm font-medium">
            Add manually
          </button>
        </div>
      )}
    </div>
  );
}
