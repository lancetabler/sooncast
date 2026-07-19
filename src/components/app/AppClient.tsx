"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, CalendarDays, ChevronDown, Compass, ListChecks, Plus, Search, Settings2, Trophy, User, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client/api";
import { registerServiceWorker, setBadge } from "@/lib/client/push";
import { occurrences } from "@/lib/client/occurrences";
import { sameDay, preciseCountdown, fmtDay, fmtTime, addDays, startOfDay } from "@/lib/domain/format";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Occurrence } from "@/lib/domain/types";
import type { ClientEvent, ClientCategory, StateBundle, LiveStatus } from "@/lib/client/types";
import { EventCard } from "./EventCard";
import { EventDialog } from "./EventDialog";
import { EventDetail } from "./EventDetail";
import { Discover } from "./Discover";
import { CalendarView } from "./CalendarView";
import { SettingsView } from "./SettingsView";
import { ScoresView } from "./ScoresView";
import { ProfileView } from "./ProfileView";
import { Onboarding } from "./Onboarding";
import { InstallPrompt } from "./InstallPrompt";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type View = "upcoming" | "calendar" | "scores" | "discover" | "profile";

interface Section {
  key: string;
  label: string;
  items: Occurrence[];
  nearTerm: boolean;
}
const SECTION_CAP = 25; // cap cards rendered per section before "show more"

// Assign an occurrence to a section: fine-grained near term, then month-by-month.
function sectionFor(o: Occurrence, now: number): { key: string; label: string; order: number; nearTerm: boolean } {
  const s = o.start;
  const nowDate = new Date(now);
  if (now >= o.start.getTime() && now < o.end.getTime()) return { key: "live", label: "Live", order: 0, nearTerm: true };
  if (sameDay(s, nowDate)) return { key: "today", label: "Today", order: 1, nearTerm: true };
  if (sameDay(s, addDays(nowDate, 1))) return { key: "tomorrow", label: "Tomorrow", order: 2, nearTerm: true };
  if (s.getTime() < addDays(startOfDay(nowDate), 7).getTime()) return { key: "week", label: "This week", order: 3, nearTerm: true };
  const label = s.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return { key: `m-${s.getFullYear()}-${s.getMonth()}`, label, order: 100 + s.getFullYear() * 12 + s.getMonth(), nearTerm: false };
}

export default function AppClient({ initial }: { initial: StateBundle }) {
  const router = useRouter();
  const [state, setState] = useState<StateBundle>(initial);
  const [view, setView] = useState<View>("upcoming");
  const [filter, setFilter] = useState<string>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [hideWatched, setHideWatched] = useState(false);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [coarseNow, setCoarseNow] = useState(() => Date.now());

  const [editing, setEditing] = useState<ClientEvent | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [detail, setDetail] = useState<ClientEvent | null>(null);
  const [showOnboard, setShowOnboard] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [liveMap, setLiveMap] = useState<Record<string, LiveStatus>>({});
  const [savedViews, setSavedViews] = useState<{ id: string; name: string; categoryId: string; search: string }[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("radarr_views");
      if (raw) setSavedViews(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);
  function persistViews(v: typeof savedViews) {
    setSavedViews(v);
    localStorage.setItem("radarr_views", JSON.stringify(v));
  }
  function saveCurrentView() {
    const name = prompt("Name this view:");
    if (!name?.trim()) return;
    persistViews([...savedViews, { id: Math.random().toString(36).slice(2), name: name.trim(), categoryId: filter, search }]);
  }
  function applyView(v: { categoryId: string; search: string }) {
    setFilter(v.categoryId);
    setSearch(v.search);
    if (v.search) setShowSearch(true);
    setView("upcoming");
  }

  const catById = useMemo(() => new Map(state.categories.map((c) => [c.id, c])), [state.categories]);

  // Names of teams the user follows directly — used to highlight/filter their games.
  const favoriteTeams = useMemo(
    () => state.follows.filter((f) => f.ref.includes("/teams/")).map((f) => f.label.toLowerCase()).filter(Boolean),
    [state.follows]
  );
  const isFavorite = useCallback(
    (title: string) => {
      if (!favoriteTeams.length) return false;
      const t = title.toLowerCase();
      return favoriteTeams.some((name) => t.includes(name));
    },
    [favoriteTeams]
  );

  const refresh = useCallback(async () => {
    try {
      setState(await api.state());
    } catch {
      /* keep last state */
    }
  }, []);

  // countdown ticker (1s) for live countdowns; coarse clock (30s) drives the heavy grouping memos
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const c = setInterval(() => setCoarseNow(Date.now()), 30_000);
    return () => {
      clearInterval(t);
      clearInterval(c);
    };
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
    const soon = occurrences(state.events, new Date(coarseNow), new Date(coarseNow + 86400_000)).length;
    setBadge(soon);
  }, [state.events, coarseNow]);

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

  // Sections: Live/Today/Tomorrow/This week, then month-by-month. Driven by the coarse clock.
  const sections = useMemo<Section[]>(() => {
    const from = new Date(coarseNow - 3 * 3600_000);
    const to = new Date(coarseNow + 400 * 86400_000);
    const occ = occurrences(state.events, from, to, {
      categoryId: filter,
      search,
      favoriteTeams: favoritesOnly ? favoriteTeams : undefined,
      hideWatched,
    });
    const map = new Map<string, Section>();
    const order = new Map<string, number>();
    for (const o of occ) {
      const sec = sectionFor(o, coarseNow);
      let entry = map.get(sec.key);
      if (!entry) {
        entry = { key: sec.key, label: sec.label, items: [], nearTerm: sec.nearTerm };
        map.set(sec.key, entry);
        order.set(sec.key, sec.order);
      }
      entry.items.push(o);
    }
    return [...map.values()].sort((a, b) => order.get(a.key)! - order.get(b.key)!);
  }, [state.events, filter, search, coarseNow, favoritesOnly, favoriteTeams, hideWatched]);

  const usedCategories = useMemo(() => {
    const ids = new Set(state.events.map((e) => e.categoryId));
    return state.categories.filter((c) => ids.has(c.id));
  }, [state.events, state.categories]);

  const nextUp = useMemo(() => {
    for (const sec of sections) {
      const fut = sec.items.find((o) => o.start.getTime() > now);
      if (fut) return fut;
    }
    return null;
  }, [sections, now]);

  // occurrences whose time overlaps another (near-term timed events only — that's where clashes matter)
  const clashKeys = useMemo(() => {
    const all = sections.filter((s) => s.nearTerm).flatMap((s) => s.items).filter((o) => !o.event.allDay && !o.event.countUp);
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
  }, [sections]);

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

  const totalUpcoming = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col pb-24">
      <div className="app-backdrop" aria-hidden />
      {/* Header */}
      <header className="radarr-glow sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/60 bg-background/70 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-sm shadow-primary/30">
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
        {view === "profile" && (
          <button onClick={() => setSettingsOpen(true)} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary" aria-label="Settings">
            <Settings2 className="size-5" />
          </button>
        )}
      </header>

      {showSearch && (view === "upcoming" || view === "calendar") && (
        <div className="px-4 pt-3">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search everything you track…" autoFocus />
        </div>
      )}

      {/* Saved views */}
      {(view === "upcoming" || view === "calendar") && (savedViews.length > 0 || filter !== "all" || search.trim() !== "") && (
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-4 pt-3">
          {savedViews.map((v) => (
            <button
              key={v.id}
              onClick={() => applyView(v)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Bookmark className="size-3" /> {v.name}
              <span
                role="button"
                aria-label="Delete view"
                onClick={(e) => { e.stopPropagation(); persistViews(savedViews.filter((x) => x.id !== v.id)); }}
                className="ml-0.5 hover:text-destructive"
              >
                ×
              </span>
            </button>
          ))}
          {(filter !== "all" || search.trim() !== "") && !savedViews.some((v) => v.categoryId === filter && v.search === search) && (
            <button
              onClick={saveCurrentView}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3" /> Save view
            </button>
          )}
        </div>
      )}

      {/* Category filter chips + quick toggles */}
      {(view === "upcoming" || view === "calendar") &&
        (usedCategories.length > 0 || favoriteTeams.length > 0 || state.events.some((e) => e.watchedAt)) && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
            <Chip active={filter === "all"} onClick={() => setFilter("all")} label="All" />
            {usedCategories.map((c) => (
              <Chip key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)} label={`${c.emoji} ${c.name}`} color={c.color} />
            ))}
            {favoriteTeams.length > 0 && (
              <Chip active={favoritesOnly} onClick={() => setFavoritesOnly((v) => !v)} label="⭐ Favorites" />
            )}
            {state.events.some((e) => e.watchedAt) && (
              <Chip active={hideWatched} onClick={() => setHideWatched((v) => !v)} label={hideWatched ? "🙈 Watched hidden" : "👁 Hide watched"} />
            )}
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
              {sections.map((sec) => (
                <UpcomingSection
                  key={sec.key}
                  section={sec}
                  defaultOpen={sec.nearTerm}
                  catById={catById}
                  now={now}
                  liveMap={liveMap}
                  clashKeys={clashKeys}
                  isFavorite={isFavorite}
                  onOpen={openEvent}
                />
              ))}
            </div>
          )
        )}

        {view === "calendar" && (
          <CalendarView events={state.events} categories={state.categories} filter={filter} now={now} live={liveMap} onOpen={openEvent} />
        )}
        {view === "scores" && <ScoresView />}
        {view === "discover" && <Discover categories={state.categories} follows={state.follows} onChanged={refresh} />}
        {view === "profile" && <ProfileView state={state} onOpenEvent={(ev) => setDetail(ev)} />}
      </main>

      {/* FAB */}
      {(view === "upcoming" || view === "calendar") && (
        <button
          onClick={newEvent}
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-[max(1rem,calc(50vw-21rem))] z-40 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-lg shadow-primary/40 ring-1 ring-white/15 transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/50 active:scale-95"
          aria-label="Add"
        >
          <Plus className="size-7" strokeWidth={2.4} />
        </button>
      )}

      {/* Bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-2xl border-t border-border/60 bg-background/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <Tab icon={<ListChecks className="size-5" />} label="Upcoming" active={view === "upcoming"} onClick={() => setView("upcoming")} />
        <Tab icon={<CalendarDays className="size-5" />} label="Calendar" active={view === "calendar"} onClick={() => setView("calendar")} />
        <Tab icon={<Trophy className="size-5" />} label="Scores" active={view === "scores"} onClick={() => setView("scores")} />
        <Tab icon={<Compass className="size-5" />} label="Discover" active={view === "discover"} onClick={() => setView("discover")} />
        <Tab icon={<User className="size-5" />} label="Profile" active={view === "profile"} onClick={() => setView("profile")} />
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
        onChanged={refresh}
      />
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Settings</SheetTitle>
          </SheetHeader>
          <div className="px-4">
            <SettingsView state={state} onChanged={refresh} onLogout={logout} />
          </div>
        </SheetContent>
      </Sheet>
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

function UpcomingSection({
  section,
  defaultOpen,
  catById,
  now,
  liveMap,
  clashKeys,
  isFavorite,
  onOpen,
}: {
  section: Section;
  defaultOpen: boolean;
  catById: Map<string, ClientCategory>;
  now: number;
  liveMap: Record<string, LiveStatus>;
  clashKeys: Set<string>;
  isFavorite: (title: string) => boolean;
  onOpen: (occ: Occurrence) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);
  const items = showAll ? section.items : section.items.slice(0, SECTION_CAP);
  const hidden = section.items.length - items.length;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-1.5">
      <CollapsibleTrigger className="mt-2 flex w-full items-center gap-2 rounded-lg px-1 py-2 text-left transition hover:bg-secondary/40">
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.label}</span>
        <span className="tabular rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{section.items.length}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">
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
              favorite={isFavorite(occ.event.title)}
              watched={!!occ.event.watchedAt}
              onOpen={() => onOpen(occ)}
            />
          ))}
          {hidden > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="mt-1 self-center rounded-full border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              Show {hidden} more
            </button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function UpNextHero({ occ, category, now, onOpen }: { occ: Occurrence; category?: { emoji: string; name: string; color: string }; now: number; onOpen: () => void }) {
  const color = category?.color ?? "var(--primary)";
  const { d, h, m, s } = preciseCountdown(occ.start.getTime() - now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <button
      onClick={onOpen}
      className="surface surface-lift relative mb-3 mt-1 flex w-full flex-col gap-2 overflow-hidden rounded-2xl border border-border/70 p-4 text-left active:scale-[0.995]"
      style={{ background: `linear-gradient(135deg, color-mix(in oklch, ${color} 16%, var(--card)), var(--card))` }}
    >
      <span
        className="pointer-events-none absolute -right-8 -top-10 size-40 rounded-full opacity-40 blur-2xl"
        style={{ background: color }}
        aria-hidden
      />
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
      className={`group relative flex flex-1 flex-col items-center gap-1 pb-2.5 pt-3 text-[10.5px] font-medium transition-colors ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
    >
      {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" style={{ boxShadow: "0 0 10px 1px var(--primary)" }} />}
      <span
        className={`grid size-9 place-items-center rounded-xl transition-all duration-200 ${
          active ? "-translate-y-0.5 bg-primary/12" : "group-active:scale-90"
        }`}
      >
        {icon}
      </span>
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
