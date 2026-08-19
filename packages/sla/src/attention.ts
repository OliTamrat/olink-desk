// The needs-attention queue: the dashboard's ranked answer to "what should a
// person deal with first, right now".
//
// WHAT deserves attention is not decided here — `escalationsFor` already owns
// that judgement (a breach outranks a warning, an SLA problem outranks an
// ownership problem, thirty unowned minutes is somebody's problem), and two
// files each deciding it is how the dashboard and the alarm cron drift into
// disagreeing about the same ticket. This module only adds what a DISPLAY
// needs and an alarm does not: an order, a magnitude, and honest totals.
import { escalationsFor, type EscalationKind, type EscalationTicket } from "./escalation";
import { slaState } from "./state";

export interface AttentionEntry {
  ticketId: string;
  kind: EscalationKind;
  /**
   * The number a row shows beside the reason, always positive, always
   * minutes — but it means a different thing per kind, because each kind has
   * a different "how bad": BREACHED is minutes overdue, AT_RISK is minutes
   * left on the clock, UNASSIGNED_WAITING is minutes nobody has owned it.
   */
  minutes: number;
}

export interface AttentionQueue {
  /** Ranked worst-first and truncated to `limit`. */
  entries: AttentionEntry[];
  /**
   * Counts over EVERYTHING, never over the truncated list. The header says
   * "7 need attention" while showing five rows — a count derived from the
   * visible rows would silently read as "covered everything" when it had
   * not, which is the no-silent-caps rule.
   */
  totals: Record<EscalationKind, number>;
}

/** Severity bands: a broken promise, then a promise about to break, then a
 *  ticket nobody owns. Same order `escalationsFor` resolves conflicts in. */
const BAND: Record<EscalationKind, number> = {
  SLA_BREACHED: 0,
  SLA_AT_RISK: 1,
  UNASSIGNED_WAITING: 2,
};

/**
 * Rank the open tickets into a queue a person works top to bottom.
 *
 * Within a band, "worst" is the direction a person would triage in:
 * the LONGEST-overdue breach first (it has been failing the longest), the
 * SOONEST-due warning first (it is the one still savable), the
 * LONGEST-waiting unowned ticket first. Ties break on ticketId so the order
 * is stable between polls — a queue that reshuffles equal rows every thirty
 * seconds reads as activity where there is none.
 */
export function attentionQueue(
  tickets: EscalationTicket[],
  now: Date,
  limit: number,
): AttentionQueue {
  const totals: Record<EscalationKind, number> = {
    SLA_BREACHED: 0,
    SLA_AT_RISK: 0,
    UNASSIGNED_WAITING: 0,
  };

  const byId = new Map(tickets.map((t) => [t.id, t]));
  const entries: AttentionEntry[] = [];

  for (const e of escalationsFor(tickets, now)) {
    const t = byId.get(e.ticketId);
    if (!t) continue;
    totals[e.kind] += 1;

    let minutes: number;
    if (e.kind === "UNASSIGNED_WAITING") {
      minutes = Math.floor((now.getTime() - t.createdAt.getTime()) / 60000);
    } else {
      const remaining = slaState(t, now).minutesRemaining ?? 0;
      // slaState reports remaining time, negative once overdue; a display
      // wants a positive magnitude either way.
      minutes = e.kind === "SLA_BREACHED" ? Math.max(0, -remaining) : Math.max(0, remaining);
    }
    entries.push({ ticketId: e.ticketId, kind: e.kind, minutes });
  }

  entries.sort((a, b) => {
    if (BAND[a.kind] !== BAND[b.kind]) return BAND[a.kind] - BAND[b.kind];
    // Breached and unassigned: bigger minutes = worse. At risk: fewer
    // minutes left = worse.
    const worseFirst =
      a.kind === "SLA_AT_RISK" ? a.minutes - b.minutes : b.minutes - a.minutes;
    if (worseFirst !== 0) return worseFirst;
    return a.ticketId < b.ticketId ? -1 : a.ticketId > b.ticketId ? 1 : 0;
  });

  return { entries: entries.slice(0, Math.max(0, limit)), totals };
}
