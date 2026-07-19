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
    `UID:${ev.id}@cusp`,
    `DTSTAMP:${utcStamp(new Date())}`,
  ];
  if (ev.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${utcDate(start)}`);
  } else {
    lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`);
  }
  lines.push(`SUMMARY:${icsEscape((prefix ? prefix + " " : "") + ev.title)}`);
  if (ev.location) lines.push(`LOCATION:${icsEscape(ev.location)}`);
  const desc = [ev.note, ev.url ? "Link: " + ev.url : "", "Tracked in Cusp"].filter(Boolean).join("\\n");
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
    "PRODID:-//Cusp//Universal Tracker//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(opts.calName || "Cusp")}`,
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
  location?: string;
  note?: string;
}

function parseIcsDate(v: string): string | null {
  if (!v) return null;
  const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00", z] = m;
  if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString();
  // floating local — interpret as local instant
  return new Date(+y, +mo - 1, +d, +h, +mi, +s).toISOString();
}

export function parseICS(text: string): ParsedICSEvent[] {
  const out: ParsedICSEvent[] = [];
  const unfolded = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1);
  for (const b of blocks) {
    const body = b.split("END:VEVENT")[0];
    const get = (k: string) => {
      const m = body.match(new RegExp("^" + k + "[^:\\n]*:(.*)$", "m"));
      return m ? m[1].trim() : "";
    };
    const start = parseIcsDate(get("DTSTART"));
    if (!start) continue;
    const end = parseIcsDate(get("DTEND"));
    const durationMin = end
      ? Math.max(15, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000))
      : 120;
    out.push({
      uid: get("UID") || undefined,
      title: get("SUMMARY") || "Event",
      start,
      durationMin,
      location: get("LOCATION") || undefined,
      note: get("DESCRIPTION").replace(/\\n/g, " ").slice(0, 300) || undefined,
    });
  }
  return out;
}
