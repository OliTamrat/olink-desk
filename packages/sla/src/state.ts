// A ticket's live SLA state.
//
// This used to live inline inside the wallboard route, which meant the only
// thing in the product that knew a ticket had breached was a screen somebody
// had to be looking at. An SLA nobody is told about is not a promise, it is a
// number in a database — so the derivation moves here, where escalation, the
// wallboard and any future report all read the same one.
//
// Pure: the caller passes `now`. Nothing here reads the clock, so a test can
// state exactly what minute it is and the answer is not a function of when
// the suite happens to run.

export type SlaClockKind = "first_response" | "resolve";
export type SlaHealth = "ok" | "at_risk" | "breached";

/** The fields any SLA judgement needs. Deliberately structural rather than a
 *  Prisma type: the wallboard, the escalation cron and the tests all select
 *  different columns, and none of them should have to select more than this. */
export interface SlaTicketFacts {
  createdAt: Date;
  firstResponseDueAt: Date | null;
  resolveDueAt: Date | null;
  firstRespondedAt: Date | null;
}

export interface SlaState {
  health: SlaHealth;
  /** Which clock the verdict came from; null when the ticket has no SLA. */
  kind: SlaClockKind | null;
  dueAt: Date | null;
  /** Negative once overdue. Wall-clock minutes — this is for display and for
   *  ordering an escalation queue, not for re-deriving `health`. */
  minutesRemaining: number | null;
}

/** Past this fraction of the window a ticket is "at risk" — the point where a
 *  supervisor can still do something about it, which is the only reason to
 *  raise it before it is already too late. */
export const AT_RISK_FRACTION = 0.8;

/**
 * The live state of one ticket.
 *
 * The first-response clock takes precedence while it is still unmet: a desk
 * that has not spoken to the customer at all is in worse trouble than one
 * that is late finishing, and surfacing the resolve clock first would hide
 * that.
 */
export function slaState(ticket: SlaTicketFacts, now: Date): SlaState {
  const nowMs = now.getTime();
  const clock: { due: Date; kind: SlaClockKind } | null =
    !ticket.firstRespondedAt && ticket.firstResponseDueAt
      ? { due: ticket.firstResponseDueAt, kind: "first_response" }
      : ticket.resolveDueAt
        ? { due: ticket.resolveDueAt, kind: "resolve" }
        : null;

  if (!clock) {
    return { health: "ok", kind: null, dueAt: null, minutesRemaining: null };
  }

  const dueMs = clock.due.getTime();
  const minutesRemaining = Math.floor((dueMs - nowMs) / 60000);

  if (nowMs >= dueMs) {
    return { health: "breached", kind: clock.kind, dueAt: clock.due, minutesRemaining };
  }

  // Progress is measured from CREATION, not from now-minus-window: the window
  // is business hours wide, so "80% of the way to due" is only meaningful
  // against the span the promise was actually made over.
  const created = ticket.createdAt.getTime();
  const progress = (nowMs - created) / Math.max(1, dueMs - created);
  return {
    health: progress >= AT_RISK_FRACTION ? "at_risk" : "ok",
    kind: clock.kind,
    dueAt: clock.due,
    minutesRemaining,
  };
}

/** Convenience for counting a list — the wallboard's whole job. */
export function tallyHealth(
  tickets: SlaTicketFacts[],
  now: Date,
): { atRisk: number; breached: number } {
  let atRisk = 0;
  let breached = 0;
  for (const t of tickets) {
    const s = slaState(t, now);
    if (s.health === "at_risk") atRisk += 1;
    else if (s.health === "breached") breached += 1;
  }
  return { atRisk, breached };
}
