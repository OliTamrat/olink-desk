import { describe, expect, it } from "vitest";

import {
  bucketByDay,
  countBy,
  delta,
  measure,
  median,
  MIN_BASE_FOR_DELTA,
  rate,
} from "../src/stats";

describe("median", () => {
  it("takes the middle, not the mean", () => {
    // The reason this is a median: one ticket answered three weeks late
    // drags a mean until the number stops describing the desk.
    expect(median([5, 6, 7, 8, 30000])).toBe(7);
  });

  it("averages the two middles on an even count", () => {
    expect(median([2, 4, 6, 8])).toBe(5);
  });

  it("does not mutate its input", () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });

  it("is null for nothing, never zero", () => {
    expect(median([])).toBeNull();
  });
});

describe("rate", () => {
  it("is null with no denominator, NEVER zero", () => {
    // "0% of first replies were on time" on a desk that has answered nothing
    // is a lie told by a division — and the first thing a prospect sees on a
    // fresh workspace.
    expect(rate(0, 0)).toEqual({ value: null, n: 0 });
  });

  it("carries its denominator", () => {
    expect(rate(3, 4)).toEqual({ value: 0.75, n: 4 });
  });
});

describe("delta — the honesty rule", () => {
  const m = (value: number | null, n: number) => ({ value, n });

  it("refuses a change on a small base", () => {
    // Two last week and three this week is "+50%" and means nothing — but
    // printed beside an arrow it will be read as a trend and repeated in a
    // meeting.
    expect(delta(m(3, 3), m(2, 2))).toEqual({ change: null, reason: "too_few" });
  });

  it("refuses when only ONE side is thin", () => {
    expect(delta(m(50, 50), m(2, 2)).reason).toBe("too_few");
    expect(delta(m(3, 3), m(50, 50)).reason).toBe("too_few");
  });

  it("reports a real change once both sides are big enough", () => {
    const d = delta(m(75, 100), m(100, 100));
    expect(d.reason).toBe("ok");
    expect(d.change).toBeCloseTo(-0.25);
  });

  it("names WHY there is no change rather than returning a bare null", () => {
    // A silent dash reads as "no change". These reasons let the screen say
    // "no data for the previous period" in words instead.
    expect(delta(m(5, 20), m(null, 0)).reason).toBe("no_previous");
    expect(delta(m(null, 0), m(5, 20)).reason).toBe("no_current");
  });

  it("refuses to divide by a previous value of zero", () => {
    // Any increase from zero is infinite. Printing Infinity or quietly
    // substituting 100% would both be inventions.
    expect(delta(m(5, 20), m(0, 20))).toEqual({ change: null, reason: "no_previous" });
  });

  it("uses a threshold high enough to matter", () => {
    expect(MIN_BASE_FOR_DELTA).toBeGreaterThanOrEqual(10);
  });
});

describe("bucketByDay", () => {
  const from = new Date("2026-08-10T00:00:00Z");

  it("includes days with nothing in them", () => {
    // A chart drawn only from days that had tickets silently closes the gaps
    // and turns a quiet week into a flat line at the busy level.
    const out = bucketByDay(
      [new Date("2026-08-10T09:00:00Z"), new Date("2026-08-12T09:00:00Z")],
      from,
      4,
      0,
    );
    expect(out).toEqual([
      { date: "2026-08-10", count: 1 },
      { date: "2026-08-11", count: 0 },
      { date: "2026-08-12", count: 1 },
      { date: "2026-08-13", count: 0 },
    ]);
  });

  it("puts a late-evening ticket on the tenant's day, not the UTC day after", () => {
    // 21:30 in Addis (UTC+3) is 18:30 UTC — same day either way. 22:30 Addis
    // is 19:30 UTC. The case that bites is a ticket after midnight local:
    // 00:30 on the 11th in Addis is 21:30 UTC on the 10th, and a UTC bucket
    // would file it on the wrong day.
    const lateLocal = new Date("2026-08-10T21:30:00Z"); // 00:30 on the 11th in Addis
    const addis = bucketByDay([lateLocal], from, 3, 180);
    expect(addis.find((d) => d.date === "2026-08-11")?.count).toBe(1);

    const utc = bucketByDay([lateLocal], from, 3, 0);
    expect(utc.find((d) => d.date === "2026-08-10")?.count).toBe(1);
  });

  it("returns exactly the window asked for", () => {
    expect(bucketByDay([], from, 30, 180)).toHaveLength(30);
  });

  it("includes the LAST day of the window", () => {
    // The off-by-one that shipped: a caller passing `now - days` starts the
    // window mid-afternoon, so the final bucket ends yesterday and
    // everything that arrived today falls off the chart. A caller must pass
    // the start of the first day and get `days` buckets INCLUSIVE of it —
    // this pins that the helper honours that contract.
    const day0 = new Date("2026-08-10T00:00:00Z");
    const onLastDay = new Date("2026-08-12T23:00:00Z");
    const out = bucketByDay([onLastDay], day0, 3, 0);
    expect(out).toHaveLength(3);
    expect(out[out.length - 1]).toEqual({ date: "2026-08-12", count: 1 });
  });
});

describe("countBy", () => {
  it("ranks largest first, ties alphabetical", () => {
    const rows = [{ t: "a" }, { t: "b" }, { t: "b" }, { t: "c" }];
    expect(countBy(rows, (r) => r.t)).toEqual([
      { key: "b", count: 2 },
      { key: "a", count: 1 },
      { key: "c", count: 1 },
    ]);
  });

  it("skips rows with no key rather than inventing an 'unknown' bucket", () => {
    const rows = [{ t: "a" }, { t: null }];
    expect(countBy(rows, (r) => r.t)).toEqual([{ key: "a", count: 1 }]);
  });
});

describe("measure", () => {
  it("is null with n=0 for an empty set", () => {
    expect(measure([], median as (v: number[]) => number)).toEqual({ value: null, n: 0 });
  });

  it("carries the observation count alongside the value", () => {
    expect(measure([1, 2, 3], (v) => v.length)).toEqual({ value: 3, n: 3 });
  });
});
