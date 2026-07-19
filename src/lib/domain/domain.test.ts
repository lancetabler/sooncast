import { describe, it, expect } from "vitest";
import { expandEvent, expandAll, reminderFires, advance } from "./recurrence";
import { buildICS, parseICS } from "./ics";
import { humanCountdown, reminderLabel, groupFor } from "./format";
import { limitsFor, PLAN_LIMITS } from "./plan";
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
    const ics = buildICS([ev({ reminders: [60] })], { calName: "Cusp" });
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

describe("plan", () => {
  it("defaults unknown plans to FREE", () => {
    expect(limitsFor("wat")).toEqual(PLAN_LIMITS.FREE);
    expect(limitsFor("PRO")).toEqual(PLAN_LIMITS.PRO);
  });
  it("PRO lifts the follow ceiling", () => {
    expect(PLAN_LIMITS.PRO.maxFollows).toBeGreaterThan(PLAN_LIMITS.FREE.maxFollows);
  });
});
