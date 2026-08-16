// The business-hours calendar the SLA clock runs on. Pure arithmetic, no
// Date.now(), no library: Ethiopia (UTC+3) has no daylight saving, so the
// calendar works on a FIXED utc offset — exact for this market, and the
// limitation is recorded in ADR 0006 (a DST market would need a tz library,
// not a patch here).
//
// The shape below is what SlaPolicy.businessHours stores (the schema made
// it Json precisely so tenants can be configured without migrations).

export interface SlaCalendar {
  /** false = 24/7: the clock never pauses. */
  enabled: boolean;
  /** Minutes east of UTC. Ethiopia: 180. */
  utcOffsetMinutes: number;
  /** ISO weekday numbers that are workdays. 1=Mon … 7=Sun. */
  workDays: number[];
  /** Work start/end, minutes from local midnight. */
  startMinute: number;
  endMinute: number;
  /** Local dates (YYYY-MM-DD) that are holidays — the clock skips them. */
  holidays: string[];
}

// Ethiopian public holidays. Fixed-date entries recur every Gregorian year;
// movable ones (Ethiopian Easter cycle, Islamic calendar) are listed per
// year and must be extended annually — test_calendar asserts coverage for
// the current year so the gap is loud, not silent.
const FIXED_HOLIDAYS_MM_DD = [
  "01-07", // Ethiopian Christmas (Genna)
  "01-19", // Timkat (Epiphany)
  "03-02", // Adwa Victory Day
  "05-01", // International Workers' Day
  "05-05", // Patriots' Victory Day
  "05-28", // Downfall of the Derg
  "09-11", // Ethiopian New Year (Enkutatash) — Sep 12 in Gregorian leap years
  "09-27", // Meskel — day varies ±1 with the Ethiopian leap cycle
];

// Movable feasts, per Gregorian year. Sources: published Ethiopian public
// holiday calendars. Islamic dates are moon-sighting dependent — ±1 day.
const MOVABLE_HOLIDAYS: Record<number, string[]> = {
  2026: [
    "2026-03-20", // Eid al-Fitr (approx.)
    "2026-04-10", // Ethiopian Good Friday (Siklet)
    "2026-04-12", // Ethiopian Easter (Fasika)
    "2026-05-27", // Eid al-Adha (Arefa, approx.)
    "2026-08-25", // Mawlid (approx.)
  ],
  2027: [
    "2027-03-09", // Eid al-Fitr (approx.)
    "2027-04-30", // Ethiopian Good Friday
    "2027-05-02", // Ethiopian Easter
    "2027-05-16", // Eid al-Adha (approx.)
    "2027-08-14", // Mawlid (approx.)
  ],
};

export function ethiopianHolidays(years: number[]): string[] {
  const out: string[] = [];
  for (const y of years) {
    for (const mmdd of FIXED_HOLIDAYS_MM_DD) out.push(`${y}-${mmdd}`);
    out.push(...(MOVABLE_HOLIDAYS[y] ?? []));
  }
  return out;
}

export function defaultCalendar(now = new Date("2026-01-01T00:00:00Z")): SlaCalendar {
  const year = now.getUTCFullYear();
  return {
    enabled: true,
    utcOffsetMinutes: 180,
    workDays: [1, 2, 3, 4, 5, 6], // Mon–Sat
    startMinute: 8 * 60 + 30, // 08:30
    endMinute: 17 * 60 + 30, // 17:30
    holidays: ethiopianHolidays([year, year + 1]),
  };
}

/** Parse whatever is stored in SlaPolicy.businessHours, defaulting hard. */
export function parseCalendar(raw: unknown): SlaCalendar {
  const base = defaultCalendar();
  if (typeof raw !== "object" || raw === null) return base;
  const r = raw as Partial<SlaCalendar>;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : base.enabled,
    utcOffsetMinutes:
      typeof r.utcOffsetMinutes === "number" ? r.utcOffsetMinutes : base.utcOffsetMinutes,
    workDays: Array.isArray(r.workDays) && r.workDays.length > 0 ? r.workDays : base.workDays,
    startMinute: typeof r.startMinute === "number" ? r.startMinute : base.startMinute,
    endMinute: typeof r.endMinute === "number" ? r.endMinute : base.endMinute,
    holidays: Array.isArray(r.holidays) ? r.holidays : base.holidays,
  };
}

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;

interface LocalDay {
  /** UTC ms of local midnight for the day containing `t`. */
  midnightUtcMs: number;
  isoWeekday: number;
  ymd: string;
}

function localDayOf(utcMs: number, cal: SlaCalendar): LocalDay {
  const localMs = utcMs + cal.utcOffsetMinutes * MS_PER_MIN;
  const dayIndex = Math.floor(localMs / MS_PER_DAY);
  const midnightUtcMs = dayIndex * MS_PER_DAY - cal.utcOffsetMinutes * MS_PER_MIN;
  const d = new Date(dayIndex * MS_PER_DAY);
  const isoWeekday = ((d.getUTCDay() + 6) % 7) + 1; // Sun=0 → 7
  const ymd = d.toISOString().slice(0, 10);
  return { midnightUtcMs, isoWeekday, ymd };
}

function isWorkday(day: LocalDay, cal: SlaCalendar): boolean {
  return cal.workDays.includes(day.isoWeekday) && !cal.holidays.includes(day.ymd);
}

/**
 * Add `minutes` of business time to `start`. With the calendar disabled the
 * answer is plain addition. Otherwise the clock only runs inside working
 * windows: a ticket arriving Saturday night gets Monday-morning-plus-target,
 * exactly what an SLA a human is accountable for should promise.
 */
export function addBusinessMinutes(
  start: Date,
  minutes: number,
  cal: SlaCalendar,
): Date {
  if (!cal.enabled) return new Date(start.getTime() + minutes * MS_PER_MIN);

  let remaining = minutes;
  let cursor = start.getTime();
  // Hard bound: budget can never need more than minutes/workday-length days
  // plus a year of closed days; 3660 iterations is far past any real case.
  for (let i = 0; i < 3660; i++) {
    const day = localDayOf(cursor, cal);
    const windowStart = day.midnightUtcMs + cal.startMinute * MS_PER_MIN;
    const windowEnd = day.midnightUtcMs + cal.endMinute * MS_PER_MIN;

    if (isWorkday(day, cal) && cursor < windowEnd) {
      const from = Math.max(cursor, windowStart);
      const available = (windowEnd - from) / MS_PER_MIN;
      if (remaining <= available) {
        return new Date(from + remaining * MS_PER_MIN);
      }
      remaining -= available;
    }
    // Jump to the next local midnight.
    cursor = day.midnightUtcMs + MS_PER_DAY;
  }
  // Degenerate calendar (no workdays): fail open with plain addition rather
  // than an infinite due date — an SLA that can never be met is a config
  // error, not a promise.
  return new Date(start.getTime() + minutes * MS_PER_MIN);
}
