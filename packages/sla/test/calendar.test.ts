// The SLA clock's arithmetic, pinned. Times below are UTC; the default
// calendar is UTC+3 (Ethiopia), Mon–Sat 08:30–17:30 local.
import { describe, expect, it } from "vitest";

import {
  addBusinessMinutes,
  defaultCalendar,
  ethiopianHolidays,
  parseCalendar,
} from "../src/calendar";

const cal = defaultCalendar(new Date("2026-01-01T00:00:00Z"));

// Local 08:30 = 05:30 UTC; local 17:30 = 14:30 UTC.
describe("addBusinessMinutes", () => {
  it("adds within the same working day", () => {
    // Tue 2026-06-16 10:00 local = 07:00 UTC; +60min -> 11:00 local.
    const due = addBusinessMinutes(new Date("2026-06-16T07:00:00Z"), 60, cal);
    expect(due.toISOString()).toBe("2026-06-16T08:00:00.000Z");
  });

  it("a ticket landing after hours starts the clock next morning", () => {
    // Tue 20:00 local (17:00 UTC) + 15min -> Wed 08:45 local (05:45 UTC).
    const due = addBusinessMinutes(new Date("2026-06-16T17:00:00Z"), 15, cal);
    expect(due.toISOString()).toBe("2026-06-17T05:45:00.000Z");
  });

  it("a ticket landing before opening starts at opening", () => {
    // Tue 06:00 local (03:00 UTC) + 30min -> Tue 09:00 local (06:00 UTC).
    const due = addBusinessMinutes(new Date("2026-06-16T03:00:00Z"), 30, cal);
    expect(due.toISOString()).toBe("2026-06-16T06:00:00.000Z");
  });

  it("skips Sunday", () => {
    // Sat 2026-06-20 17:00 local (14:00 UTC) + 60min: 30min left Sat,
    // remaining 30min Monday from 08:30 -> Mon 09:00 local (06:00 UTC).
    const due = addBusinessMinutes(new Date("2026-06-20T14:00:00Z"), 60, cal);
    expect(due.toISOString()).toBe("2026-06-22T06:00:00.000Z");
  });

  it("skips an Ethiopian public holiday", () => {
    // Thu 2026-04-30 17:00 local + 60min. Fri 2026-05-01 is Workers' Day,
    // Sat 2026-05-02 is a workday -> Sat 09:00 local (06:00 UTC).
    const due = addBusinessMinutes(new Date("2026-04-30T14:00:00Z"), 60, cal);
    expect(due.toISOString()).toBe("2026-05-02T06:00:00.000Z");
  });

  it("spans multiple business days for long targets", () => {
    // Mon 2026-06-15 08:30 local + 3 business days (1620min) lands at the
    // END of Wednesday's window (17:30 local = 14:30 UTC) — the tighter
    // answer, same business instant as Thursday 08:30.
    const due = addBusinessMinutes(new Date("2026-06-15T05:30:00Z"), 1620, cal);
    expect(due.toISOString()).toBe("2026-06-17T14:30:00.000Z");
  });

  it("disabled calendar is plain addition (24/7)", () => {
    const c = { ...cal, enabled: false };
    const due = addBusinessMinutes(new Date("2026-06-20T14:00:00Z"), 90, c);
    expect(due.toISOString()).toBe("2026-06-20T15:30:00.000Z");
  });

  it("a calendar with no workdays fails open, not infinite", () => {
    const c = { ...cal, workDays: [] };
    const due = addBusinessMinutes(new Date("2026-06-16T07:00:00Z"), 60, c);
    expect(due.toISOString()).toBe("2026-06-16T08:00:00.000Z");
  });
});

describe("calendar data", () => {
  it("movable feasts are listed for the current default years", () => {
    // The loud failure this test exists for: when the movable-holiday table
    // has not been extended to a new year, this fails at build time rather
    // than the clock silently running through Fasika.
    const days = ethiopianHolidays([2026, 2027]);
    expect(days.filter((d) => d.startsWith("2026-")).length).toBeGreaterThanOrEqual(13);
    expect(days.filter((d) => d.startsWith("2027-")).length).toBeGreaterThanOrEqual(13);
  });

  it("parseCalendar defaults hard on junk", () => {
    for (const junk of [null, undefined, 42, "x", {}, { workDays: [] }]) {
      const c = parseCalendar(junk);
      expect(c.utcOffsetMinutes).toBe(180);
      expect(c.workDays.length).toBeGreaterThan(0);
    }
  });
});
