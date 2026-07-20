"use client";

import { useRef, useState } from "react";
import { Bell, Check, Eye, MapPin, Repeat, Share2, Star } from "lucide-react";
import type { Occurrence } from "@/lib/domain/types";
import type { ClientCategory, LiveStatus } from "@/lib/client/types";
import { humanCountdown, fmtTime } from "@/lib/domain/format";
import { haptic } from "@/lib/client/haptics";

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
  onSwipeLeft,
  onSwipeRight,
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
  onSwipeLeft?: () => void; // swipe ← : mark watched
  onSwipeRight?: () => void; // swipe → : share
}) {
  const color = category?.color ?? "var(--primary)";
  const swipeable = !!(onSwipeLeft || onSwipeRight);

  // Horizontal swipe with tap preserved (only engages once horizontal movement dominates).
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const axisRef = useRef<"none" | "h" | "v">("none");
  const movedRef = useRef(false);
  const SWIPE = 72;

  function onTouchStart(e: React.TouchEvent) {
    if (!swipeable || e.touches.length !== 1) return;
    startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    axisRef.current = "none";
    movedRef.current = false;
    setDragging(true);
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!swipeable || !startRef.current) return;
    const dx = e.touches[0].clientX - startRef.current.x;
    const dy = e.touches[0].clientY - startRef.current.y;
    if (axisRef.current === "none") {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) axisRef.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (axisRef.current !== "h") return; // let vertical scroll happen
    movedRef.current = true;
    if (e.cancelable) e.preventDefault();
    // clamp, and don't allow a direction that has no action
    let x = Math.max(-96, Math.min(96, dx));
    if (x < 0 && !onSwipeLeft) x = 0;
    if (x > 0 && !onSwipeRight) x = 0;
    setDragX(x);
  }
  function onTouchEnd() {
    if (!swipeable) return;
    setDragging(false);
    const x = dragX;
    if (x <= -SWIPE && onSwipeLeft) {
      haptic();
      onSwipeLeft();
    } else if (x >= SWIPE && onSwipeRight) {
      haptic();
      onSwipeRight();
    }
    setDragX(0);
    startRef.current = null;
    axisRef.current = "none";
  }
  function handleClick() {
    if (movedRef.current) {
      movedRef.current = false;
      return; // was a swipe, not a tap
    }
    onOpen();
  }

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

  const card = (
    <button
      onClick={handleClick}
      onTouchStart={swipeable ? onTouchStart : undefined}
      onTouchMove={swipeable ? onTouchMove : undefined}
      onTouchEnd={swipeable ? onTouchEnd : undefined}
      onTouchCancel={swipeable ? onTouchEnd : undefined}
      style={swipeable ? { transform: `translateX(${dragX}px)`, transition: dragging ? "none" : "transform 0.2s ease" } : undefined}
      className={`surface surface-lift group relative flex w-full items-stretch gap-3 rounded-2xl border border-border/70 bg-card p-3 text-left active:scale-[0.99] hover:-translate-y-px hover:border-border ${isPast && !occ.event.countUp ? "opacity-55" : ""} ${isLive ? "border-red-500/40" : ""} ${favorite ? "ring-1 ring-primary/50" : ""}`}
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

  if (!swipeable) return card;

  // Action layers revealed behind the card as it slides.
  const leftOpacity = Math.max(0, Math.min(1, dragX / SWIPE)); // swipe → : share
  const rightOpacity = Math.max(0, Math.min(1, -dragX / SWIPE)); // swipe ← : watched
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-between overflow-hidden rounded-2xl px-5">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-primary" style={{ opacity: leftOpacity }}>
          <Share2 className="size-5" /> Share
        </span>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-400" style={{ opacity: rightOpacity }}>
          {watched ? "Unwatch" : "Watched"} {watched ? <Eye className="size-5" /> : <Check className="size-5" />}
        </span>
      </div>
      {card}
    </div>
  );
}
