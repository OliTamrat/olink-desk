// What deserves an alarm, decided as a pure function.
//
// Kept out of the cron route on purpose: "which tickets should wake somebody
// up" is a product judgement that has to be arguable and testable, and a
// route handler is where such judgements go to become untestable.

import { slaState, type SlaTicketFacts } from "./state";

export type EscalationKind = "SLA_AT_RISK" | "SLA_BREACHED" | "UNASSIGNED_WAITING";

export interface EscalationTicket extends SlaTicketFacts {
  id: string;
  assigneeId: string | null;
}

export interface Escalation {
  ticketId: string;
  kind: EscalationKind;
  /** Who to address it to; null means the whole workspace. */
  userId: string | null;
}

/** How long a ticket may sit with no owner before it is somebody's problem.
 *  Independent of the SLA clock: a workspace with a generous SLA still needs
 *  to notice that nobody has picked a ticket up. */
export const UNASSIGNED_MINUTES = 30;

/**
 * Decide what to raise for one pass over the open tickets.
 *
 * Rules, in the order they matter:
 *
 * 1. **A breach outranks a warning.** Once a ticket is past due, warning that
 *    it is *about* to be late is noise, so a breached ticket yields only the
 *    breach. Emitting both would also mean every breach arrives as two
 *    notifications, which trains people to ignore them.
 * 2. **An SLA problem outranks an ownership problem.** A late ticket needs
 *    action now; who owns it is a detail of how that action happens.
 * 3. **Alarms follow the owner, and fall back to everyone.** An assigned
 *    ticket's alarm is addressed to its assignee, because a message to
 *    "everyone" about a ticket that already has an owner is a message nobody
 *    reads. An unowned one is addressed to nobody, which is what makes it
 *    visible to the whole workspace.
 *
 * Deduplication is NOT done here. The unique constraint on
 * (ticketId, kind) is the thing that makes repeated passes idempotent, and
 * putting a second mechanism in front of it would give two answers to one
 * question.
 */
export function escalationsFor(
  tickets: EscalationTicket[],
  now: Date,
): Escalation[] {
  const out: Escalation[] = [];
  for (const t of tickets) {
    const state = slaState(t, now);

    if (state.health === "breached") {
      out.push({ ticketId: t.id, kind: "SLA_BREACHED", userId: t.assigneeId });
      continue;
    }
    if (state.health === "at_risk") {
      out.push({ ticketId: t.id, kind: "SLA_AT_RISK", userId: t.assigneeId });
      continue;
    }
    if (
      !t.assigneeId &&
      now.getTime() - t.createdAt.getTime() >= UNASSIGNED_MINUTES * 60000
    ) {
      out.push({ ticketId: t.id, kind: "UNASSIGNED_WAITING", userId: null });
    }
  }
  return out;
}
