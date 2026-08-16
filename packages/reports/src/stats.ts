// The arithmetic behind the reports, kept pure so the honesty rules are
// testable rather than aspirational.
//
// A report is the one screen in a support product that gets quoted in a board
// pack, printed, and argued over months later. Everything here exists to stop
// it saying something it cannot support.

/** A measurement that may not exist, with the count it rests on.
 *  The count travels WITH the value on purpose — see `Delta` below. */
export interface Measure {
  value: number | null;
  /** How many observations produced it. */
  n: number;
}

export function measure(values: number[], compute: (v: number[]) => number): Measure {
  if (values.length === 0) return { value: null, n: 0 };
  return { value: compute(values), n: values.length };
}

/**
 * Median, not mean.
 *
 * One ticket answered three weeks late drags a mean so far that the number
 * stops describing the desk. A supervisor asking "how long do people usually
 * wait" is asking for the middle, and the median is the only answer that
 * survives one pathological row.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** A rate, or null when there is nothing to divide by.
 *
 *  NEVER 0 for an empty set: "0% of first replies were on time" on a desk
 *  that has answered nothing is a lie told by a division, and it is the first
 *  thing a prospect would see on a fresh workspace. */
export function rate(hits: number, total: number): Measure {
  if (total <= 0) return { value: null, n: 0 };
  return { value: hits / total, n: total };
}

/** Below this many observations, a period-over-period change is noise. */
export const MIN_BASE_FOR_DELTA = 10;

export interface Delta {
  /** Fractional change, e.g. -0.25 for a quarter faster. Null when it cannot
   *  honestly be stated. */
  change: number | null;
  /** Why there is no change to show — surfaced so the UI can say which,
   *  rather than rendering a silent dash that reads as "no change". */
  reason: "ok" | "no_previous" | "no_current" | "too_few";
}

/**
 * Period-over-period change, refused when the base is too small.
 *
 * **A percentage change on three tickets is noise dressed as insight.** Two
 * tickets last week and three this week is "+50% volume" and means nothing —
 * but printed next to an arrow it will be read as a trend and repeated in a
 * meeting. Below `MIN_BASE_FOR_DELTA` observations on EITHER side, this
 * returns null with a reason, and the screen says so in words.
 */
export function delta(current: Measure, previous: Measure): Delta {
  if (previous.value === null || previous.n === 0) {
    return { change: null, reason: "no_previous" };
  }
  if (current.value === null || current.n === 0) {
    return { change: null, reason: "no_current" };
  }
  if (current.n < MIN_BASE_FOR_DELTA || previous.n < MIN_BASE_FOR_DELTA) {
    return { change: null, reason: "too_few" };
  }
  if (previous.value === 0) {
    // Any increase from zero is an infinite percentage. Refuse rather than
    // print Infinity or silently substitute 100%.
    return { change: null, reason: "no_previous" };
  }
  return { change: (current.value - previous.value) / previous.value, reason: "ok" };
}

/**
 * One bucket per day across the whole window, including days with nothing.
 *
 * The empty days matter: a chart drawn only from days that had tickets
 * silently closes the gaps and turns a quiet week into a flat line at the
 * busy level. Dates are `YYYY-MM-DD` in the tenant's own offset, because a
 * ticket at 9pm in Addis belongs to that day, not to the UTC day after it.
 */
export function bucketByDay(
  dates: Date[],
  from: Date,
  days: number,
  utcOffsetMinutes: number,
): Array<{ date: string; count: number }> {
  const key = (d: Date) =>
    new Date(d.getTime() + utcOffsetMinutes * 60000).toISOString().slice(0, 10);

  const counts = new Map<string, number>();
  for (const d of dates) {
    const k = key(d);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const out: Array<{ date: string; count: number }> = [];
  for (let i = 0; i < days; i += 1) {
    const day = new Date(from.getTime() + i * 86400000);
    const k = key(day);
    out.push({ date: k, count: counts.get(k) ?? 0 });
  }
  return out;
}

/** Count by a key, largest first — "what are people contacting us about". */
export function countBy<T>(rows: T[], keyOf: (row: T) => string | null): Array<{
  key: string;
  count: number;
}> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const k = keyOf(row);
    if (k === null) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
