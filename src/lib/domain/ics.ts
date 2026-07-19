import type { Freq, TrackEvent } from "./types";

const FREQ_MAP: Record<Freq, string | null> = {
  none: null,
  daily: "DAILY",
  weekly: "WEEKLY",
  biweekly: "WEEKLY;INTERVAL=2",
  monthly: "MONTHLY",
};

const pad = (n: number) => String(n).padStart(2, "0");
function icsEscape(s: string) {
  return String(s ?? "").replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
}
/** UTC stamp e.g. 20260101T140000Z */
function utcStamp(d: Date) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}
function utcDate(d: Date) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

/** Fold long lines to 75 octets per RFC 5545. */
function fold(line: string) {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let s = line;
  parts.push(s.slice(0, 75));
  s = s.slice(75);
  while (s.length > 74) {
    parts.push(" " + s.slice(0, 74));
    s = s.slice(74);
  }
  if (s.length) parts.push(" " + s);
  return parts.join("\r\n");
}

export interface ICSOptions {
  calName?: string;
  emojiPrefix?: (ev: TrackEvent) => string;
}

function vevent(ev: TrackEvent, opts: ICSOptions): string {
  const start = new Date(ev.start);
  const durMin = ev.allDay ? 24 * 60 : ev.durationMin || 120;
  const end = new Date(start.getTime() + durMin * 60_000);
  const prefix = opts.emojiPrefix ? opts.emojiPrefix(ev) : "";
  const lines: string[] = [
    "BEGIN:VEVENT",
    `UID:${ev.id}@radarr`,
    `DTSTAMP:${utcStamp(new Date())}`,
  ];
  if (ev.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${utcDate(start)}`);
  } else {
    lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`);
  }
  lines.push(`SUMMARY:${icsEscape((prefix ? prefix + " " : "") + ev.title)}`);
  if (ev.location) lines.push(`LOCATION:${icsEscape(ev.location)}`);
  const desc = [ev.note, ev.url ? "Link: " + ev.url : "", "Tracked in Radarr"].filter(Boolean).join("\\n");
  if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`);
  const rrule = FREQ_MAP[ev.freq];
  if (rrule) {
    let r = `RRULE:FREQ=${rrule}`;
    if (ev.until) r += `;UNTIL=${utcStamp(new Date(ev.until))}`;
    lines.push(r);
  }
  for (const min of ev.reminders || []) {
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(ev.title)}`, `TRIGGER:-PT${min}M`, "END:VALARM");
  }
  lines.push("END:VEVENT");
  return lines.map(fold).join("\r\n");
}

export function buildICS(events: TrackEvent[], opts: ICSOptions = {}): string {
  const head = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Radarr//Universal Tracker//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(opts.calName || "Radarr")}`,
  ];
  const body = events.map((e) => vevent(e, opts));
  return [...head, ...body, "END:VCALENDAR"].join("\r\n");
}

/* ------------------------------- parsing -------------------------------- */
export interface ParsedICSEvent {
  uid?: string;
  title: string;
  start: string; // ISO
  durationMin: number;
  allDay: boolean;
  location?: string;
  note?: string;
}

// Offset (ms) of `tz` vs UTC near `utcGuess`: (wall-clock-as-UTC) − (actual UTC).
function tzOffsetMs(tz: string, utcGuess: Date): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(utcGuess);
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const asUTC = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"));
    return asUTC - utcGuess.getTime();
  } catch {
    return 0;
  }
}
// Convert a wall-clock time stated in `tz` to the correct UTC instant.
function zonedToUTC(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  let offset = tzOffsetMs(tz, new Date(naive));
  offset = tzOffsetMs(tz, new Date(naive - offset)); // refine once across a DST edge
  return new Date(naive - offset);
}

// Parse a DTSTART/DTEND property (its params + value) into an instant + all-day flag.
function parseDt(params: string, value: string): { iso: string; allDay: boolean } | null {
  const v = value.trim();
  const dateOnly = /VALUE=DATE(?!-TIME)/i.test(params) || /^\d{8}$/.test(v);
  const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00", z] = m;
  if (dateOnly) {
    // Store all-day at noon UTC so it lands on the right calendar day for any viewer.
    return { iso: new Date(Date.UTC(+y, +mo - 1, +d, 12, 0, 0)).toISOString(), allDay: true };
  }
  if (z) return { iso: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString(), allDay: false };
  const tzid = params.match(/TZID=([^;:]+)/i)?.[1];
  if (tzid) return { iso: zonedToUTC(+y, +mo, +d, +h, +mi, +s, tzid).toISOString(), allDay: false };
  // floating time with no zone — best effort: treat as UTC
  return { iso: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString(), allDay: false };
}

export function parseICS(text: string): ParsedICSEvent[] {
  const out: ParsedICSEvent[] = [];
  const unfolded = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1);
  for (const b of blocks) {
    const body = b.split("END:VEVENT")[0];
    const line = (k: string): { params: string; value: string } | null => {
      const m = body.match(new RegExp("^" + k + "([^:\\n]*):(.*)$", "m"));
      return m ? { params: m[1], value: m[2].trim() } : null;
    };
    const get = (k: string) => line(k)?.value ?? "";
    const dtStart = line("DTSTART");
    if (!dtStart) continue;
    const startParsed = parseDt(dtStart.params, dtStart.value);
    if (!startParsed) continue;
    const dtEnd = line("DTEND");
    const endParsed = dtEnd ? parseDt(dtEnd.params, dtEnd.value) : null;
    const durationMin =
      endParsed && !startParsed.allDay
        ? Math.max(15, Math.round((new Date(endParsed.iso).getTime() - new Date(startParsed.iso).getTime()) / 60_000))
        : startParsed.allDay
          ? 1440
          : 120;
    out.push({
      uid: get("UID") || undefined,
      title: get("SUMMARY") || "Event",
      start: startParsed.iso,
      durationMin,
      allDay: startParsed.allDay,
      location: get("LOCATION") || undefined,
      note: get("DESCRIPTION").replace(/\\n/g, " ").slice(0, 300) || undefined,
    });
  }
  return out;
}
