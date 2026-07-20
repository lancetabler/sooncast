"use client";

import { Bell, Check, MapPin, Repeat, Star } from "lucide-react";
import type { Occurrence } from "@/lib/domain/types";
import type { ClientCategory, LiveStatus } from "@/lib/client/types";
import { humanCountdown, fmtTime } from "@/lib/domain/format";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function scoreLine(live: LiveStatus): string | null {
  if (!live.away || !live.home) return null;
  return `${live.away.abbr} ${live.away.score}–${live.home.score} ${live.home.abbr}`;
}

export function EventCard({
  occ,
  category,
  now,
  reminders,
  live,
  clash,
  favorite,
  watched,
  onOpen,
}: {
  occ: Occurrence;
  category?: ClientCategory;
  now: number;
  reminders: number;
  live?: LiveStatus;
  clash?: boolean;
  favorite?: boolean;
  watched?: boolean;
  onOpen: () => void;
}) {
  const color = category?.color ?? "var(--primary)";
  const start = occ.start;
  const startMs = start.getTime();
  const endMs = occ.end.getTime();
  const isLive = now >= startMs && now < endMs;
  const isPast = now >= endMs;
  const diff = startMs - now;
  const recurring = occ.event.freq && occ.event.freq !== "none";
  const watch = occ.event.note && occ.event.note.startsWith("📺") ? occ.event.note.replace(/^📺\s*/, "") : null;

  let cd = humanCountdown(diff);
  let cdClass = "text-muted-foreground";
  if (isLive) {
    cd = "LIVE";
    cdClass = "text-red-400";
  } else if (isPast) {
    cd = "ended";
  } else if (diff < 3600_000) {
    cdClass = "text-amber-400";
  }

  // Count-up events show time since their date instead of a countdown.
  if (occ.event.countUp) {
    cd = humanCountdown(now - startMs);
    cdClass = "text-muted-foreground";
  }

  // Live scores: keep the pill SHORT ("LIVE"/"Final") and show the score on the wrapping
  // meta line below, so a long score can never force the card past the screen edge.
  let scoreText: string | null = null;
  if (live?.state === "in") {
    cd = "LIVE";
    cdClass = "text-red-400";
    scoreText = scoreLine(live);
  } else if (live?.state === "post") {
    cd = "Final";
    cdClass = "text-muted-foreground";
    scoreText = scoreLine(live);
  }

  return (
    <button
      onClick={onOpen}
      className={`surface surface-lift group flex w-full items-stretch gap-3 rounded-2xl border border-border/70 bg-card p-3 text-left active:scale-[0.99] hover:-translate-y-px hover:border-border ${isPast && !occ.event.countUp ? "opacity-55" : ""} ${isLive ? "border-red-500/40" : ""} ${favorite ? "ring-1 ring-primary/50" : ""}`}
    >
      <span className="w-1 shrink-0 rounded-full" style={{ background: color }} />
      <div className="flex w-14 shrink-0 flex-col items-center justify-center">
        <span className="text-xl font-bold leading-none">{start.getDate()}</span>
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{MONTHS[start.getMonth()]}</span>
        <span className="mt-0.5 text-xs text-muted-foreground/80">{DOW[start.getDay()]}</span>
      </div>

      {occ.event.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={occ.event.imageUrl} alt="" className="size-9 shrink-0 self-center rounded-lg object-contain" />
      )}

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color }}>
          {category?.emoji} {category?.name ?? "Event"}
          {favorite && <Star className="size-3 fill-current text-primary" />}
          {watched && <Check className="size-3 text-emerald-400" />}
          {recurring && <Repeat className="size-3 opacity-70" />}
          {reminders > 0 && <Bell className="size-3 opacity-70" />}
        </span>
        <span className="truncate text-[15px] font-semibold tracking-tight">{occ.event.title}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{occ.event.allDay ? "All day" : fmtTime(start)}</span>
          {scoreText && <span className={`font-semibold ${live?.state === "in" ? "text-red-400" : "text-foreground"}`}>{scoreText}</span>}
          {occ.event.location && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-3 shrink-0" /> <span className="truncate">{occ.event.location}</span>
            </span>
          )}
          {watch && <span className="inline-flex min-w-0 items-center gap-1 text-foreground/70">📺 <span className="truncate">{watch}</span></span>}
          {clash && <span className="font-medium text-amber-400">⚠ overlaps</span>}
        </span>
      </div>

      <span className={`tabular shrink-0 self-center whitespace-nowrap rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-semibold ${cdClass}`}>
        {cd}
      </span>
    </button>
  );
}
