export function humanCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d >= 1) return d === 1 && h > 0 ? `1d ${h}h` : `${d}d`;
  if (h >= 1) return `${h}h ${m}m`;
  if (m >= 1) return `${m}m`;
  return "soon";
}

export function preciseCountdown(ms: number): { d: number; h: number; m: number; s: number } {
  const t = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(t / 86400),
    h: Math.floor((t % 86400) / 3600),
    m: Math.floor((t % 3600) / 60),
    s: t % 60,
  };
}

const REMINDER_LABELS: Record<number, string> = {
  0: "At start",
  10: "10 min before",
  30: "30 min before",
  60: "1 hour before",
  180: "3 hours before",
  720: "12 hours before",
  1440: "1 day before",
  2880: "2 days before",
  10080: "1 week before",
};

export function reminderLabel(min: number): string {
  if (REMINDER_LABELS[min]) return REMINDER_LABELS[min];
  if (min === 0) return "At start";
  if (min % 1440 === 0) return `${min / 1440} day${min / 1440 > 1 ? "s" : ""} before`;
  if (min % 60 === 0) return `${min / 60} hour${min / 60 > 1 ? "s" : ""} before`;
  return `${min} min before`;
}

export const REMINDER_PRESETS = [0, 10, 30, 60, 180, 720, 1440, 2880, 10080];

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
export function fmtDay(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
export function fmtLongDay(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export type GroupLabel = "Live" | "Today" | "Tomorrow" | "This week" | "Later";
export function groupFor(start: Date, end: Date, now: Date): GroupLabel {
  if (now >= start && now < end) return "Live";
  if (sameDay(start, now)) return "Today";
  if (sameDay(start, addDays(now, 1))) return "Tomorrow";
  if (start < addDays(startOfDay(now), 7)) return "This week";
  return "Later";
}
