import type { Freq, Occurrence, ReminderFire, TrackEvent } from "./types";

const MS = 60_000;
const GUARD = 6000;

/** Calendar day-count for a year/month (month 0-11). DST-agnostic (uses UTC). */
function daysInMonth(y: number, mo: number): number {
  return new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
}

/** Advance a Date by one period in the PROCESS-LOCAL timezone (client-side path). */
export function advance(d: Date, freq: Freq, anchorDay?: number): Date | null {
  const x = new Date(d);
  switch (freq) {
    case "daily": x.setDate(x.getDate() + 1); return x;
    case "weekly": x.setDate(x.getDate() + 7); return x;
    case "biweekly": x.setDate(x.getDate() + 14); return x;
    case "monthly": {
      // Anchor to the original day-of-month and clamp, so Jan 31 → Feb 28 → Mar 31
      // instead of overflowing (Jan 31 → Mar 3) and skipping February forever.
      const day = anchorDay ?? x.getDate();
      x.setDate(1);
      x.setMonth(x.getMonth() + 1);
      x.setDate(Math.min(day, daysInMonth(x.getFullYear(), x.getMonth())));
      return x;
    }
    default: return null;
  }
}

/* ---- timezone-aware expansion (server-side) ----------------------------------
 * The server process runs in UTC, but reminders must fire at the same LOCAL
 * wall-clock the client counts down to. Expanding in the user's timezone keeps
 * the two in agreement across DST changes. */

interface WallClock { y: number; mo: number; d: number; h: number; mi: number; s: number; ms: number }

/** Minutes east of UTC for `date` observed in `tz`. */
function tzOffsetMin(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(date)) if (part.type !== "literal") p[part.type] = Number(part.value);
  const hour = p.hour === 24 ? 0 : p.hour; // some engines report 24 for midnight
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, hour, p.minute, p.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

/** The wall-clock fields of `date` as observed in `tz`. */
function wallClockIn(date: Date, tz: string): WallClock {
  const shifted = new Date(date.getTime() + tzOffsetMin(date, tz) * 60000);
  return {
    y: shifted.getUTCFullYear(), mo: shifted.getUTCMonth(), d: shifted.getUTCDate(),
    h: shifted.getUTCHours(), mi: shifted.getUTCMinutes(), s: shifted.getUTCSeconds(), ms: shifted.getUTCMilliseconds(),
  };
}

/** Convert wall-clock fields in `tz` back to the absolute instant. */
function wallClockToDate(w: WallClock, tz: string): Date {
  const guess = Date.UTC(w.y, w.mo, w.d, w.h, w.mi, w.s, w.ms);
  const off = tzOffsetMin(new Date(guess), tz);
  const instant = guess - off * 60000;
  const off2 = tzOffsetMin(new Date(instant), tz);
  return off2 === off ? new Date(instant) : new Date(guess - off2 * 60000);
}

/** Add whole calendar days to a wall-clock (pure calendar math via UTC). */
function rollDays(w: WallClock, days: number): WallClock {
  const t = new Date(Date.UTC(w.y, w.mo, w.d, w.h, w.mi, w.s, w.ms));
  t.setUTCDate(t.getUTCDate() + days);
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth(), d: t.getUTCDate(), h: w.h, mi: w.mi, s: w.s, ms: w.ms };
}

function advanceWall(w: WallClock, freq: Freq, anchorDay: number): WallClock | null {
  switch (freq) {
    case "daily": return rollDays(w, 1);
    case "weekly": return rollDays(w, 7);
    case "biweekly": return rollDays(w, 14);
    case "monthly": {
      let mo = w.mo + 1, y = w.y;
      if (mo > 11) { mo = 0; y++; }
      return { y, mo, d: Math.min(anchorDay, daysInMonth(y, mo)), h: w.h, mi: w.mi, s: w.s, ms: w.ms };
    }
    default: return null;
  }
}

const periodDaysOf = (freq: Freq): number => (freq === "daily" ? 1 : freq === "weekly" ? 7 : freq === "biweekly" ? 14 : 0);

/**
 * Expand an event into its occurrences overlapping [from, to].
 * Pass `tz` (an IANA zone) to expand in that timezone — the server does this
 * with the user's timezone so reminders match the client's local countdown.
 */
export function expandEvent(ev: TrackEvent, from: Date, to: Date, tz?: string): Occurrence[] {
  const base = new Date(ev.start);
  if (isNaN(base.getTime())) return [];
  const durMin = ev.allDay ? 24 * 60 : ev.durationMin || 120;
  const mk = (start: Date): Occurrence => ({
    event: ev,
    start,
    end: new Date(start.getTime() + durMin * MS),
    key: `${ev.id}@${start.toISOString()}`,
  });

  if (!ev.freq || ev.freq === "none") {
    const end = new Date(base.getTime() + durMin * MS);
    return end >= from && base <= to ? [mk(base)] : [];
  }

  const until = ev.until ? new Date(ev.until) : null;
  const out: Occurrence[] = [];
  const periodDays = periodDaysOf(ev.freq);

  if (tz) {
    const anchorDay = wallClockIn(base, tz).d;
    let w: WallClock | null = wallClockIn(base, tz);
    let cur = base;
    // Fast-forward close to `from` so a years-old base can't exhaust the guard.
    if (periodDays && cur < from) {
      const jumps = Math.floor((from.getTime() - cur.getTime()) / (periodDays * 86400_000)) - 1;
      if (jumps > 0) { w = rollDays(w, jumps * periodDays); cur = wallClockToDate(w, tz); }
    }
    let guard = 0;
    while (w && cur < from && guard < GUARD) {
      if (until && cur > until) return out;
      w = advanceWall(w, ev.freq, anchorDay);
      if (!w) break;
      cur = wallClockToDate(w, tz);
      guard++;
    }
    guard = 0;
    while (w && cur <= to && guard < GUARD) {
      if (until && cur > until) break;
      if (cur >= from) out.push(mk(cur));
      w = advanceWall(w, ev.freq, anchorDay);
      if (!w) break;
      cur = wallClockToDate(w, tz);
      guard++;
    }
    return out;
  }

  const anchorDay = base.getDate();
  let cur: Date | null = new Date(base);
  // Fast-forward for fixed intervals (setDate keeps wall-clock, so no DST drift).
  if (periodDays && cur < from) {
    const jumps = Math.floor((from.getTime() - cur.getTime()) / (periodDays * 86400_000)) - 1;
    if (jumps > 0) cur.setDate(cur.getDate() + jumps * periodDays);
  }
  let guard = 0;
  while (cur && cur < from && guard < GUARD) {
    if (until && cur > until) return out;
    cur = advance(cur, ev.freq, anchorDay);
    guard++;
  }
  guard = 0; // separate budget for the emit loop so catch-up can't starve it
  while (cur && cur <= to && guard < GUARD) {
    if (until && cur > until) break;
    if (cur >= from) out.push(mk(new Date(cur)));
    cur = advance(cur, ev.freq, anchorDay);
    guard++;
  }
  return out;
}

/** Expand many events, sorted by start ascending. */
export function expandAll(events: TrackEvent[], from: Date, to: Date, tz?: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const ev of events) out.push(...expandEvent(ev, from, to, tz));
  out.sort((a, b) => a.start.getTime() - b.start.getTime());
  return out;
}

/** Reminder fire-times for occurrences in a window (used by scheduler/cron). */
export function reminderFires(occurrences: Occurrence[]): ReminderFire[] {
  const fires: ReminderFire[] = [];
  for (const occ of occurrences) {
    for (const min of occ.event.reminders || []) {
      fires.push({
        key: `${occ.key}#${min}`,
        eventId: occ.event.id,
        title: occ.event.title,
        fireAt: new Date(occ.start.getTime() - min * MS),
        occStart: occ.start,
        minutes: min,
        location: occ.event.location,
        url: occ.event.url,
        note: occ.event.note,
      });
    }
  }
  return fires;
}
