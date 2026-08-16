import { describe, expect, it } from "vitest";

import { escalationsFor, UNASSIGNED_MINUTES, type EscalationTicket } from "../src/escalation";

const T0 = new Date("2026-08-16T09:00:00Z");
const at = (mins: number) => new Date(T0.getTime() + mins * 60000);

const ticket = (over: Partial<EscalationTicket> = {}): EscalationTicket => ({
  id: "t1",
  assigneeId: "agent-1",
  createdAt: T0,
  firstResponseDueAt: at(100),
  resolveDueAt: at(500),
  firstRespondedAt: null,
  ...over,
});

describe("escalationsFor", () => {
  it("raises nothing for a healthy owned ticket", () => {
    expect(escalationsFor([ticket()], at(10))).toEqual([]);
  });

  it("raises at-risk while there is still time to act", () => {
    expect(escalationsFor([ticket()], at(85))).toEqual([
      { ticketId: "t1", kind: "SLA_AT_RISK", userId: "agent-1" },
    ]);
  });

  it("raises ONLY the breach once a ticket is past due", () => {
    // Emitting both would make every breach arrive as two notifications,
    // which is how people learn to ignore them.
    const raised = escalationsFor([ticket()], at(120));
    expect(raised).toEqual([
      { ticketId: "t1", kind: "SLA_BREACHED", userId: "agent-1" },
    ]);
  });

  it("addresses an owned ticket's alarm to its owner", () => {
    expect(escalationsFor([ticket({ assigneeId: "agent-9" })], at(120))[0].userId).toBe(
      "agent-9",
    );
  });

  it("addresses an unowned ticket's alarm to nobody, so everyone sees it", () => {
    // null is not "no recipient", it is "the workspace" — addressing it to an
    // individual would hide a ticket nobody owns behind one person's list.
    expect(escalationsFor([ticket({ assigneeId: null })], at(120))[0].userId).toBeNull();
  });

  it("raises unassigned-waiting only after the threshold", () => {
    const orphan = ticket({ assigneeId: null, firstResponseDueAt: null, resolveDueAt: null });
    expect(escalationsFor([orphan], at(UNASSIGNED_MINUTES - 1))).toEqual([]);
    expect(escalationsFor([orphan], at(UNASSIGNED_MINUTES))).toEqual([
      { ticketId: "t1", kind: "UNASSIGNED_WAITING", userId: null },
    ]);
  });

  it("prefers the SLA problem over the ownership problem", () => {
    // A late ticket needs action now; who owns it is a detail of how that
    // action happens. Raising both would double every orphaned breach.
    const orphanLate = ticket({ assigneeId: null });
    const raised = escalationsFor([orphanLate], at(120));
    expect(raised).toHaveLength(1);
    expect(raised[0].kind).toBe("SLA_BREACHED");
  });

  it("does not raise unassigned-waiting for a ticket somebody owns", () => {
    const owned = ticket({ firstResponseDueAt: null, resolveDueAt: null });
    expect(escalationsFor([owned], at(10_000))).toEqual([]);
  });

  it("says nothing about a ticket whose first reply went out on time", () => {
    // The met clock must stop ticking, or every answered ticket eventually
    // fills the escalation queue with work that was done properly.
    const answered = ticket({ firstRespondedAt: at(20) });
    expect(escalationsFor([answered], at(200))).toEqual([]);
  });

  it("emits at most one escalation per ticket per pass", () => {
    const rows = [
      ticket({ id: "a" }),
      ticket({ id: "b", assigneeId: null }),
      ticket({ id: "c", firstResponseDueAt: at(5) }),
    ];
    const raised = escalationsFor(rows, at(120));
    expect(new Set(raised.map((r) => r.ticketId)).size).toBe(raised.length);
  });

  it("handles an empty pass", () => {
    expect(escalationsFor([], at(0))).toEqual([]);
  });
});
