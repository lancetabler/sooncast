import { describe, it, expect } from "vitest";
import { expandEvent, expandAll, reminderFires, advance } from "./recurrence";
import { buildICS, parseICS } from "./ics";
import { humanCountdown, reminderLabel, groupFor } from "./format";
import { watchLinks, streamingService } from "./watch";
import { gpTitle } from "../sources/motogp";
import { bumpSeason, tsdbStart } from "../sources/thesportsdb";
import { nascarDelta } from "../sports";
import type { TrackEvent } from "./types";

function ev(partial: Partial<TrackEvent>): TrackEvent {
  return {
    id: "e1",
    title: "Test",
    start: "2026-07-20T14:00:00.000Z",
    allDay: false,
    durationMin: 120,
    freq: "none",
    reminders: [],
    ...partial,
  };
}

describe("recurrence", () => {
  it("includes a one-off event inside the window", () => {
    const from = new Date("2026-07-01T00:00:00Z");
    const to = new Date("2026-08-01T00:00:00Z");
    expect(expandEvent(ev({}), from, to)).toHaveLength(1);
  });

  it("excludes a one-off event outside the window", () => {
    const from = new Date("2026-09-01T00:00:00Z");
    const to = new Date("2026-10-01T00:00:00Z");
    expect(expandEvent(ev({}), from, to)).toHaveLength(0);
  });

  it("expands a weekly event across a month", () => {
    const from = new Date("2026-07-20T00:00:00Z");
    const to = new Date("2026-08-17T15:00:00Z"); // just past the 5th occurrence at 14:00Z
    const occ = expandEvent(ev({ freq: "weekly" }), from, to);
    expect(occ.length).toBe(5); // 7/20, 7/27, 8/3, 8/10, 8/17
    // strictly increasing
    for (let i = 1; i < occ.length; i++) {
      expect(occ[i].start.getTime()).toBeGreaterThan(occ[i - 1].start.getTime());
    }
  });

  it("honors UNTIL", () => {
    const from = new Date("2026-07-20T00:00:00Z");
    const to = new Date("2026-12-01T00:00:00Z");
    const occ = expandEvent(ev({ freq: "weekly", until: "2026-08-05T00:00:00Z" }), from, to);
    expect(occ.length).toBe(3); // 7/20, 7/27, 8/3
  });

  it("advance() steps correctly", () => {
    const d = new Date("2026-01-31T00:00:00Z");
    expect(advance(d, "daily")!.getUTCDate()).toBe(1); // Feb 1
    expect(advance(d, "none")).toBeNull();
  });

  it("expandAll sorts by start", () => {
    const a = ev({ id: "a", start: "2026-07-25T10:00:00Z" });
    const b = ev({ id: "b", start: "2026-07-21T10:00:00Z" });
    const occ = expandAll([a, b], new Date("2026-07-01Z"), new Date("2026-08-01Z"));
    expect(occ[0].event.id).toBe("b");
    expect(occ[1].event.id).toBe("a");
  });

  it("computes reminder fire times", () => {
    const from = new Date("2026-07-01Z");
    const to = new Date("2026-08-01Z");
    const occ = expandEvent(ev({ reminders: [0, 60] }), from, to);
    const fires = reminderFires(occ);
    expect(fires).toHaveLength(2);
    const atStart = fires.find((f) => f.minutes === 0)!;
    const hourBefore = fires.find((f) => f.minutes === 60)!;
    expect(atStart.fireAt.toISOString()).toBe("2026-07-20T14:00:00.000Z");
    expect(hourBefore.fireAt.toISOString()).toBe("2026-07-20T13:00:00.000Z");
  });
});

describe("ics", () => {
  it("builds a VCALENDAR with VEVENT and VALARM", () => {
    const ics = buildICS([ev({ reminders: [60] })], { calName: "Radarr" });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Test");
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT60M");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("emits RRULE for recurring events", () => {
    const ics = buildICS([ev({ freq: "weekly" })]);
    expect(ics).toContain("RRULE:FREQ=WEEKLY");
    const bi = buildICS([ev({ freq: "biweekly" })]);
    expect(bi).toContain("RRULE:FREQ=WEEKLY;INTERVAL=2");
  });

  it("round-trips through parseICS", () => {
    const ics = buildICS([ev({ title: "Grand Prix", location: "Silverstone" })]);
    const parsed = parseICS(ics);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe("Grand Prix");
    expect(parsed[0].location).toBe("Silverstone");
    expect(new Date(parsed[0].start).toISOString()).toBe("2026-07-20T14:00:00.000Z");
    expect(parsed[0].allDay).toBe(false);
  });

  it("parses VALUE=DATE as an all-day event anchored at noon UTC", () => {
    const ics = "BEGIN:VEVENT\r\nUID:x\r\nSUMMARY:IMSA Race\r\nDTSTART;VALUE=DATE:20251011\r\nDTEND;VALUE=DATE:20251012\r\nEND:VEVENT";
    const [p] = parseICS(ics);
    expect(p.allDay).toBe(true);
    expect(p.start).toBe("2025-10-11T12:00:00.000Z");
    expect(p.title).toBe("IMSA Race");
  });

  it("converts a TZID datetime to the correct UTC instant", () => {
    // 7:00 PM America/New_York in January is EST (UTC-5) → 00:00Z the next day
    const ics = "BEGIN:VEVENT\r\nSUMMARY:Show\r\nDTSTART;TZID=America/New_York:20260115T190000\r\nEND:VEVENT";
    const [p] = parseICS(ics);
    expect(p.allDay).toBe(false);
    expect(p.start).toBe("2026-01-16T00:00:00.000Z");
  });

  it("treats a trailing-Z datetime as UTC", () => {
    const ics = "BEGIN:VEVENT\r\nSUMMARY:UTC\r\nDTSTART:20260720T140000Z\r\nEND:VEVENT";
    const [p] = parseICS(ics);
    expect(p.start).toBe("2026-07-20T14:00:00.000Z");
  });
});

describe("format", () => {
  it("humanCountdown", () => {
    expect(humanCountdown(-1000)).toBe("now");
    expect(humanCountdown(90 * 60 * 1000)).toBe("1h 30m");
    expect(humanCountdown(3 * 86400 * 1000)).toBe("3d");
  });
  it("reminderLabel", () => {
    expect(reminderLabel(0)).toBe("At start");
    expect(reminderLabel(60)).toBe("1 hour before");
    expect(reminderLabel(1440)).toBe("1 day before");
    expect(reminderLabel(43200)).toBe("30 days before");
  });
  it("groupFor buckets by proximity", () => {
    const now = new Date("2026-07-20T09:00:00");
    expect(groupFor(new Date("2026-07-20T08:00:00"), new Date("2026-07-20T10:00:00"), now)).toBe("Live");
    expect(groupFor(new Date("2026-07-20T20:00:00"), new Date("2026-07-20T22:00:00"), now)).toBe("Today");
    expect(groupFor(new Date("2026-07-21T20:00:00"), new Date("2026-07-21T22:00:00"), now)).toBe("Tomorrow");
  });
});

describe("watch links", () => {
  it("parses networks from a 📺 note and links the ones it knows", () => {
    const links = watchLinks("📺 FOX, FS1, Mystery Channel");
    expect(links.map((l) => l.name)).toEqual(["FOX", "FS1", "Mystery Channel"]);
    expect(links[0].url).toContain("foxsports.com");
    expect(links[1].url).toContain("foxsports.com");
    expect(links[2].url).toBeUndefined();
  });

  it("maps Flo and FanDuel families by prefix", () => {
    expect(watchLinks("FloRacing")[0].url).toContain("flosports.tv");
    expect(watchLinks("FanDuel SN DET")[0].url).toContain("fanduelsportsnetwork.com");
  });

  it("deep-links series to the right OTT service", () => {
    expect(streamingService({ title: "6 Hours of Fuji", sourceLabel: "FIA WEC" })?.name).toBe("FIAWEC+");
    expect(streamingService({ title: "Rally Finland", sourceLabel: "WRC" })?.url).toContain("rally.tv");
    expect(streamingService({ title: "Hungarian Grand Prix", sourceLabel: "Formula 1" })?.name).toBe("F1 TV");
    // MotoGP rounds are also called "Grand Prix" — must not resolve to F1 TV.
    expect(streamingService({ title: "MotoGP Grand Prix of Japan" })?.name).toBe("MotoGP VideoPass");
    expect(streamingService({ title: "Bruins at Rangers", sourceLabel: "NHL" })).toBeNull();
  });

  it("does NOT mistake other 'Grand Prix' series for F1", () => {
    // IndyCar's Grand Prix of Nashville must go to FOX, not F1 TV.
    const indy = streamingService({ title: "Grand Prix of Nashville", sourceLabel: "IndyCar Series" });
    expect(indy?.name).toBe("FOX Sports");
    expect(indy?.url).toContain("fox.com");
    // NASCAR is multi-network — a where-to-watch schedule link, not a single OTT.
    const nascar = streamingService({ title: "NASCAR Cup Series at North Wilkesboro", sourceLabel: "NASCAR Cup Series" });
    expect(nascar?.url).toContain("nascar.com");
    expect(nascar?.cta).toMatch(/where to watch/i);
  });
});

describe("live sources helpers", () => {
  it("gpTitle strips sponsors and title-cases", () => {
    expect(gpTitle("QATAR AIRWAYS GRAND PRIX OF GREAT BRITAIN ")).toBe("Grand Prix of Great Britain");
    expect(gpTitle("GRAN PREMIO DE ESPAÑA")).toBe("Gran Premio de España");
  });

  it("nascarDelta formats gaps and laps down", () => {
    expect(nascarDelta(0)).toBe("");
    expect(nascarDelta(1.25)).toBe("+1.3s");
    expect(nascarDelta(-1)).toBe("1 lap down");
    expect(nascarDelta(-3)).toBe("3 laps down");
    expect(nascarDelta("junk")).toBe("");
  });

  it("bumpSeason handles year and year-range formats", () => {
    expect(bumpSeason("2025")).toBe("2026");
    expect(bumpSeason("2025-2026")).toBe("2026-2027");
    expect(bumpSeason("garbage")).toBeNull();
  });

  it("tsdbStart uses UTC timestamps and falls back to all-day", () => {
    expect(tsdbStart("2026-07-24", "10:00:00", "2026-07-24T10:00:00")).toEqual({
      start: "2026-07-24T10:00:00.000Z",
      allDay: false,
    });
    // midnight/missing time → date-only event anchored at noon UTC
    expect(tsdbStart("2026-07-24", "00:00:00", null)).toEqual({ start: "2026-07-24T12:00:00.000Z", allDay: true });
    expect(tsdbStart("2026-07-24", null, null)).toEqual({ start: "2026-07-24T12:00:00.000Z", allDay: true });
    expect(tsdbStart(null, null, null)).toBeNull();
  });
});
