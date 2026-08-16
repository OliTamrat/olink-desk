// What colour a ticket is, and why.
//
// Two axes, and keeping them apart is the whole design. **Priority** is what
// somebody decided this ticket is worth. **SLA** is what the clock says. They
// disagree constantly — a LOW-priority ticket whose first-reply promise ran
// out an hour ago is the most urgent thing on the screen, and a URGENT ticket
// answered two minutes ago needs nothing.
//
// Pure, and here rather than in a screen, because "which colour wins" is a
// rule a supervisor will argue with and a test can settle.

export type Tone = "neutral" | "info" | "success" | "warn" | "danger";

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type Priority = (typeof PRIORITIES)[number];

export function isPriority(value: string): value is Priority {
  return (PRIORITIES as readonly string[]).includes(value);
}

/**
 * The colour of a priority chip.
 *
 * **NORMAL is deliberately colourless.** Most tickets are normal, and a
 * colour on every row is a colour on none — the rail exists to make the few
 * that are not normal findable at a glance, which only works if the majority
 * stay quiet. LOW is quieter still: it is information, not an alarm.
 */
export function priorityTone(priority: string): Tone {
  switch (priority) {
    case "URGENT":
      return "danger";
    case "HIGH":
      return "warn";
    case "LOW":
      return "neutral";
    default:
      return "neutral";
  }
}

/** Whether a priority is worth drawing at all. */
export function priorityIsNotable(priority: string): boolean {
  return priority === "URGENT" || priority === "HIGH";
}

export type SlaState = "ok" | "soon" | "breached";

export interface SlaClock {
  status: string;
  createdAt: string;
  firstRespondedAt?: string | null;
  firstResponseDueAt?: string | null;
  resolveDueAt?: string | null;
}

export interface SlaReading {
  state: SlaState;
  tone: Tone;
  /** i18n key for the label. */
  key: string;
  /** Milliseconds remaining, or elapsed past due once breached. */
  ms: number;
}

/** At what fraction of the window a promise starts reading as at-risk. */
export const AT_RISK_FROM = 0.8;

/**
 * Read the clock on a ticket, or null if there is nothing to promise.
 *
 * A resolved or closed ticket has no live clock: leaving one amber forever
 * after it was answered is how a wallboard stops meaning anything.
 *
 * **A breach is `danger`, not `warn`.** It used to be the same amber as
 * at-risk, so "we still have twenty minutes" and "we broke the promise an
 * hour ago" were the same colour on a supervisor's screen — which is the one
 * distinction an SLA display exists to make.
 */
export function slaReading(t: SlaClock, now: number): SlaReading | null {
  if (t.status === "RESOLVED" || t.status === "CLOSED") return null;

  // First reply first: until the customer has heard anything at all, that is
  // the promise being measured, whatever the resolution deadline says.
  const pick =
    !t.firstRespondedAt && t.firstResponseDueAt
      ? { due: t.firstResponseDueAt, key: "ui_sla_first_due" }
      : t.resolveDueAt
        ? { due: t.resolveDueAt, key: "ui_sla_resolve_due" }
        : null;
  if (!pick) return null;

  const due = new Date(pick.due).getTime();
  const created = new Date(t.createdAt).getTime();
  if (Number.isNaN(due) || Number.isNaN(created)) return null;

  if (now >= due) {
    return { state: "breached", tone: "danger", key: "ui_sla_overdue", ms: now - due };
  }
  const progress = (now - created) / Math.max(1, due - created);
  return progress >= AT_RISK_FROM
    ? { state: "soon", tone: "warn", key: pick.key, ms: due - now }
    : { state: "ok", tone: "info", key: pick.key, ms: due - now };
}

const RANK: Record<Tone, number> = {
  neutral: 0,
  info: 1,
  success: 1,
  warn: 2,
  danger: 3,
};

/**
 * The single colour a ticket row is allowed — its left rail.
 *
 * A row has one rail, so the two axes have to be resolved into one answer:
 * **whichever is more alarming wins.** A breached SLA outranks any priority,
 * because a broken promise is a fact while a priority is an opinion, and
 * showing "HIGH" in amber on a row whose clock ran out red buries the thing
 * that actually needs doing.
 *
 * Returns null when there is nothing worth saying — an ordinary ticket, on
 * time. That is most of them, and it is what makes the coloured ones legible.
 */
export function rowTone(
  priority: string,
  sla: SlaReading | null,
): Exclude<Tone, "neutral"> | null {
  const fromPriority = priorityIsNotable(priority) ? priorityTone(priority) : "neutral";
  const fromSla = sla && sla.state !== "ok" ? sla.tone : "neutral";
  const winner = RANK[fromSla] >= RANK[fromPriority] ? fromSla : fromPriority;
  // The narrowed return type is the point: "neutral" and "no rail" are the
  // same thing, and a caller that has to handle both is a caller that will
  // eventually paint a neutral rail somewhere.
  return winner === "neutral" ? null : winner;
}
