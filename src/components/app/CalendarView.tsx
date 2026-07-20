"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Occurrence } from "@/lib/domain/types";
import type { ClientCategory, ClientEvent, LiveStatus } from "@/lib/client/types";
import { occurrences as occFn } from "@/lib/client/occurrences";
import { EventCard } from "./EventCard";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

export function CalendarView({
  events, categories, filter, search, favoritesOnly, favoriteTeams, hideWatched, now, live, onOpen, onToggleWatched, onShare,
}: {
  events: ClientEvent[];
  categories: ClientCategory[];
  filter: string;
  search: string;
  favoritesOnly: boolean;
  favoriteTeams: string[];
  hideWatched: boolean;
  now: number;
  live?: Record<string, LiveStatus>;
  onOpen: (occ: Occurrence) => void;
  onToggleWatched: (eventId: string) => void;
  onShare: (eventId: string) => void;
}) {
  const today = new Date();
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selectedDay, setSelectedDay] = useState<number>(
    ym.y === today.getFullYear() && ym.m === today.getMonth() ? today.getDate() : 1
  );

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const { byDay, first, daysInMonth } = useMemo(() => {
    const first = new Date(ym.y, ym.m, 1);
    const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
    const monthStart = new Date(ym.y, ym.m, 1);
    const monthEnd = new Date(ym.y, ym.m, daysInMonth, 23, 59, 59);
    const occ = occFn(events, monthStart, monthEnd, {
      categoryId: filter,
      search,
      favoriteTeams: favoritesOnly ? favoriteTeams : undefined,
      hideWatched,
    });
    const byDay = new Map<number, Occurrence[]>();
    for (const o of occ) {
      // Bucket onto a cell that exists this month: use the start day when it's in-month,
      // otherwise clamp (an occurrence spilling in from a prior month lands on day 1) so it
      // never falls through a day-number the grid doesn't have (e.g. the 31st in February).
      const inMonth = o.start.getFullYear() === ym.y && o.start.getMonth() === ym.m;
      const d = inMonth ? o.start.getDate() : o.start < monthStart ? 1 : daysInMonth;
      const day = Math.min(Math.max(d, 1), daysInMonth);
      (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(o);
    }
    return { byDay, first, daysInMonth };
  }, [events, filter, search, favoritesOnly, favoriteTeams, hideWatched, ym]);

  function shift(delta: number) {
    const d = new Date(ym.y, ym.m + delta, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
    setSelectedDay(1);
  }

  const startPad = first.getDay();
  const cells: Array<number | null> = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const selected = byDay.get(selectedDay) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight">
          {MONTHS[ym.m]} {ym.y}
        </h2>
        <div className="flex gap-1">
          <button onClick={() => shift(-1)} className="grid size-9 place-items-center rounded-lg hover:bg-secondary" aria-label="Previous month">
            <ChevronLeft className="size-5" />
          </button>
          <button
            onClick={() => { setYm({ y: today.getFullYear(), m: today.getMonth() }); setSelectedDay(today.getDate()); }}
            className="grid size-9 place-items-center rounded-lg text-xs hover:bg-secondary"
            aria-label="Today"
          >
            Today
          </button>
          <button onClick={() => shift(1)} className="grid size-9 place-items-center rounded-lg hover:bg-secondary" aria-label="Next month">
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {DOW.map((d, i) => (
          <div key={i} className="py-1 text-center text-[11px] font-semibold text-muted-foreground">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const occ = byDay.get(day) ?? [];
          const isToday = ym.y === today.getFullYear() && ym.m === today.getMonth() && day === today.getDate();
          const isSel = day === selectedDay;
          const colors = [...new Set(occ.map((o) => catById.get(o.event.categoryId ?? "")?.color).filter(Boolean))].slice(0, 3);
          return (
            <button
              key={i}
              onClick={() => setSelectedDay(day)}
              aria-label={`${MONTHS[ym.m]} ${day}${occ.length ? `, ${occ.length} event${occ.length > 1 ? "s" : ""}` : ""}`}
              aria-pressed={isSel}
              className={`flex aspect-square flex-col rounded-xl border p-1.5 text-left transition ${isSel ? "border-primary bg-primary/10" : occ.length ? "border-border bg-card" : "border-border/50"} ${isToday && !isSel ? "border-primary/60" : ""}`}
            >
              <span className="flex items-start justify-between">
                <span className={`text-xs font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}>{day}</span>
                {occ.length > 0 && <span className="tabular text-[9px] font-semibold text-muted-foreground/80">{occ.length}</span>}
              </span>
              <span className="mt-auto flex flex-wrap gap-0.5">
                {colors.map((c, j) => (
                  <span key={j} className="size-1.5 rounded-full" style={{ background: c as string }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {MONTHS[ym.m]} {selectedDay} · {selected.length || "nothing"}
        </p>
        {selected.map((occ) => (
          <EventCard
            key={occ.key}
            occ={occ}
            category={catById.get(occ.event.categoryId ?? "")}
            now={now}
            reminders={occ.event.reminders.length}
            live={live?.[occ.event.id]}
            watched={!!occ.event.watchedAt}
            onOpen={() => onOpen(occ)}
            onSwipeLeft={() => onToggleWatched(occ.event.id)}
            onSwipeRight={() => onShare(occ.event.id)}
          />
        ))}
      </div>
    </div>
  );
}
