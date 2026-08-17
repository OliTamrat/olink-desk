// Retention windows: what a tenant may set, and what a window means.
//
// Everything here is arithmetic over a number of days and a clock. It holds
// no database handle on purpose — the pass that actually empties rows is a
// route, and the rules that decide WHICH rows are testable without one.

/** Keep forever. Expressed as a value rather than left implicit in `null`. */
export const KEEP_FOREVER = null;

/**
 * The shortest window an administrator may set.
 *
 * Not a round number picked for looks: a desk's own tickets get reopened.
 * A customer replies to a solved ticket days later, a supervisor audits last
 * week's work, a dispute arrives about a call. A window under a month starts
 * destroying the evidence for questions the tenant is still being asked, and
 * the destruction is irreversible — this is the one setting in the product
 * where a mistyped value cannot be undone by retyping it.
 */
export const MIN_RETENTION_DAYS = 30;

/**
 * The longest. Ten years is past every retention schedule a bank, telecom or
 * government desk in this market operates under; beyond it the honest setting
 * is `KEEP_FOREVER`, which says what is meant instead of hiding it behind a
 * number nobody will ever reach.
 */
export const MAX_RETENTION_DAYS = 3650;

/** Offered in the settings picker. A tenant may still type any valid number. */
export const RETENTION_PRESETS = [90, 180, 365, 730, 1095, 2555] as const;

export type RetentionField = "ticket" | "audit";

export interface RetentionPolicy {
  /** Days to keep a closed ticket's CONTENT. Null keeps it forever. */
  ticketRetentionDays: number | null;
  /** Days to keep audit rows. Null keeps them forever. */
  auditRetentionDays: number | null;
}

/**
 * Why one value is not allowed, or null if it is.
 *
 * Returns a machine-readable reason rather than a sentence: the caller is an
 * API route in a product that speaks six languages, and an English string
 * baked in here would be the one error message a customer's administrator
 * reads in the wrong language.
 */
export type WindowProblem =
  | "not_an_integer"
  | "below_minimum"
  | "above_maximum";

export function windowProblem(days: number | null): WindowProblem | null {
  if (days === KEEP_FOREVER) return null;
  if (!Number.isInteger(days)) return "not_an_integer";
  if (days < MIN_RETENTION_DAYS) return "below_minimum";
  if (days > MAX_RETENTION_DAYS) return "above_maximum";
  return null;
}

/**
 * The rule that makes the two windows a policy rather than two settings.
 *
 * The audit log is the record that content was destroyed. Keeping it for a
 * SHORTER time than the content itself means the proof of a deletion expires
 * before the deletion does — the tenant ends up able to show neither the
 * ticket nor the fact that it was lawfully removed, which is the worst of
 * both obligations. `KEEP_FOREVER` on the audit side always satisfies this;
 * `KEEP_FOREVER` on the ticket side means nothing shorter will do.
 */
export function auditWindowTooShort(policy: RetentionPolicy): boolean {
  const { ticketRetentionDays: content, auditRetentionDays: audit } = policy;
  if (audit === KEEP_FOREVER) return false;
  if (content === KEEP_FOREVER) return true;
  return audit < content;
}

/** Every problem with a proposed policy, empty when it is settable. */
export function policyProblems(policy: RetentionPolicy): string[] {
  const problems: string[] = [];
  const ticket = windowProblem(policy.ticketRetentionDays);
  if (ticket) problems.push(`ticket:${ticket}`);
  const audit = windowProblem(policy.auditRetentionDays);
  if (audit) problems.push(`audit:${audit}`);
  // Only meaningful once both values are individually valid — otherwise the
  // comparison is between numbers that were never going to be stored.
  if (!ticket && !audit && auditWindowTooShort(policy)) {
    problems.push("audit:shorter_than_content");
  }
  return problems;
}

/**
 * The instant before which a window's content is eligible.
 *
 * Null in, null out — "keep forever" has no cutoff, and returning e.g. the
 * epoch instead would make a caller that forgot to check delete everything.
 */
export function cutoff(days: number | null, now: Date): Date | null {
  if (days === KEEP_FOREVER) return null;
  return new Date(now.getTime() - days * 86_400_000);
}

/**
 * Whether a ticket's content is eligible on this pass.
 *
 * Keyed on `closedAt`, never on `createdAt`: the window is a promise about
 * how long a FINISHED matter is kept, and a long-running ticket that is still
 * open is still being worked on. A ticket with no `closedAt` is never
 * eligible, however old it is.
 */
export function ticketEligible(
  ticket: { closedAt: Date | null },
  before: Date | null,
): boolean {
  if (before === null) return false;
  if (!ticket.closedAt) return false;
  return ticket.closedAt.getTime() < before.getTime();
}

/**
 * How many days from now until a closed ticket's content is destroyed —
 * negative once it is overdue, null when nothing will happen to it.
 *
 * This exists so a screen can say "erased in 41 days" on the ticket itself.
 * A retention policy nobody can see the effect of is a policy that surprises
 * somebody the first time it runs.
 */
export function daysUntilErasure(
  ticket: { closedAt: Date | null },
  days: number | null,
  now: Date,
): number | null {
  if (days === KEEP_FOREVER || !ticket.closedAt) return null;
  const dueAt = ticket.closedAt.getTime() + days * 86_400_000;
  return Math.ceil((dueAt - now.getTime()) / 86_400_000);
}
