// How the desk's work divides across the ticket lifecycle, as one row per
// state with a count, a share and where clicking it goes.
//
// Pure, and here rather than in the screen, because two of the rules are the
// kind that look like rounding and are actually correctness: shares must sum
// to 100, and a state with no tickets must still have a row.

export const LIFECYCLE = ["NEW", "OPEN", "PENDING", "DONE"] as const;
export type LifecycleKey = (typeof LIFECYCLE)[number];

export interface Slice {
  key: LifecycleKey;
  count: number;
  /** Whole percent of the total. Sums to exactly 100 when the total is > 0. */
  percent: number;
  /** Inbox query this row drills into. */
  href: string;
  /** i18n key for the label. */
  label: string;
}

const SPEC: Record<LifecycleKey, { label: string; href: string }> = {
  NEW: { label: "ui_st_new", href: "/inbox?view=all&status=NEW" },
  OPEN: { label: "ui_st_open", href: "/inbox?view=all&status=OPEN" },
  PENDING: { label: "ui_st_pending", href: "/inbox?view=all&status=PENDING" },
  // RESOLVED and CLOSED are one segment. Both mean "not on anybody's desk",
  // and splitting them makes a four-hue chart into five — past the point
  // where adjacent segments stay distinguishable under colour-blindness.
  // They remain separate statuses everywhere a ticket is actually worked.
  DONE: { label: "ui_st_done", href: "/inbox?view=solved" },
};

export interface StatusCounts {
  NEW?: number;
  OPEN?: number;
  PENDING?: number;
  RESOLVED?: number;
  CLOSED?: number;
}

/**
 * Turn raw per-status counts into the rows the overview draws.
 *
 * **Shares are largest-remainder, not independent rounding.** Four numbers
 * each rounded on their own routinely sum to 99 or 101, and a panel whose
 * percentages do not add up is a panel nobody trusts with the counts either.
 *
 * **Every state gets a row, including the empty ones.** "In Review 0" is
 * information — it says the desk has that state and nothing is in it. Dropping
 * empty rows makes the list change shape as work moves through it, which is
 * exactly when somebody is reading it.
 */
export function composition(counts: StatusCounts): { total: number; slices: Slice[] } {
  const raw: Record<LifecycleKey, number> = {
    NEW: Math.max(0, counts.NEW ?? 0),
    OPEN: Math.max(0, counts.OPEN ?? 0),
    PENDING: Math.max(0, counts.PENDING ?? 0),
    DONE: Math.max(0, counts.RESOLVED ?? 0) + Math.max(0, counts.CLOSED ?? 0),
  };
  const total = LIFECYCLE.reduce((sum, k) => sum + raw[k], 0);

  const exact = LIFECYCLE.map((key) => ({
    key,
    count: raw[key],
    share: total > 0 ? (raw[key] / total) * 100 : 0,
  }));
  const floored = exact.map((e) => ({ ...e, percent: Math.floor(e.share) }));
  let short = total > 0 ? 100 - floored.reduce((s, e) => s + e.percent, 0) : 0;
  // Hand the missing points to the largest remainders, biggest first — the
  // standard apportionment rule, and the only one that cannot hand a point to
  // a state with no tickets in it.
  const order = [...floored]
    .filter((e) => e.count > 0)
    .sort((a, b) => b.share - Math.floor(b.share) - (a.share - Math.floor(a.share)));
  for (const e of order) {
    if (short <= 0) break;
    e.percent += 1;
    short -= 1;
  }

  return {
    total,
    slices: floored.map((e) => ({
      key: e.key,
      count: e.count,
      percent: e.percent,
      label: SPEC[e.key].label,
      href: SPEC[e.key].href,
    })),
  };
}
