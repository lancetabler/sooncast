import type { Freq, Occurrence, ReminderFire, TrackEvent } from "./types";

const MS = 60_000;

export function advance(d: Date, freq: Freq): Date | null {
  const x = new Date(d);
  switch (freq) {
    case "daily": x.setDate(x.getDate() + 1); return x;
    case "weekly": x.setDate(x.getDate() + 7); return x;
    case "biweekly": x.setDate(x.getDate() + 14); return x;
    case "monthly": x.setMonth(x.getMonth() + 1); return x;
    default: return null;
  }
}

/** Expand an event into its occurrences overlapping [from, to]. */
export function expandEvent(ev: TrackEvent, from: Date, to: Date): Occurrence[] {
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
    // include if the event window overlaps [from,to]
    const end = new Date(base.getTime() + durMin * MS);
    return end >= from && base <= to ? [mk(base)] : [];
  }

  const until = ev.until ? new Date(ev.until) : null;
  const out: Occurrence[] = [];
  let cur: Date | null = new Date(base);
  let guard = 0;
  while (cur && cur < from && guard < 5000) {
    if (until && cur > until) return out;
    cur = advance(cur, ev.freq);
    guard++;
  }
  while (cur && cur <= to && guard < 5000) {
    if (until && cur > until) break;
    if (cur >= from) out.push(mk(new Date(cur)));
    cur = advance(cur, ev.freq);
    guard++;
  }
  return out;
}

/** Expand many events, sorted by start ascending. */
export function expandAll(events: TrackEvent[], from: Date, to: Date): Occurrence[] {
  const out: Occurrence[] = [];
  for (const ev of events) out.push(...expandEvent(ev, from, to));
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
      });
    }
  }
  return fires;
}
