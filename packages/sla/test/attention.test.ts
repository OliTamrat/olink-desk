import { describe, expect, it } from "vitest";

import { attentionQueue } from "../src/attention";
import type { EscalationTicket } from "../src/escalation";

const T0 = new Date("2026-08-16T09:00:00Z");
const at = (mins: number) => new Date(T0.getTime() + mins * 60000);

const ticket = (
  id: string,
  over: Partial<EscalationTicket> = {},
): EscalationTicket => ({
  id,
  assigneeId: "agent-1",
  createdAt: T0,
  firstResponseDueAt: at(100),
  resolveDueAt: at(500),
  firstRespondedAt: null,
  ...over,
});

describe("attentionQueue", () => {
  it("is empty for a healthy desk, with zero totals", () => {
    const q = attentionQueue([ticket("a")], at(10), 8);
    expect(q.entries).toEqual([]);
    expect(q.totals).toEqual({
      SLA_BREACHED: 0,
      SLA_AT_RISK: 0,
      UNASSIGNED_WAITING: 0,
    });
  });

  it("ranks breached above at-risk above unassigned, whatever order they arrive in", () => {
    const q = attentionQueue(
      [
        // unassigned since T0, judged at minute 60 → 60 minutes waiting
        ticket("unowned", { assigneeId: null, firstResponseDueAt: at(600), resolveDueAt: null }),
        ticket("warning"), // due at 100, judged at 90 → at risk
        ticket("late", { firstResponseDueAt: at(30) }), // due at 30 → 60 overdue
      ],
      at(90),
      8,
    );
    expect(q.entries.map((e) => e.ticketId)).toEqual(["late", "warning", "unowned"]);
  });

  it("orders breaches longest-overdue first — the one failing the longest leads", () => {
    const q = attentionQueue(
      [
        ticket("recent", { firstResponseDueAt: at(80) }), // 10 overdue at 90
        ticket("ancient", { firstResponseDueAt: at(20) }), // 70 overdue
      ],
      at(90),
      8,
    );
    expect(q.entries.map((e) => e.ticketId)).toEqual(["ancient", "recent"]);
    expect(q.entries[0].minutes).toBe(70);
    expect(q.entries[1].minutes).toBe(10);
  });

  it("orders at-risk soonest-due first — the savable one leads", () => {
    // Both past 80% of their window at minute 95 but neither due yet.
    const q = attentionQueue(
      [
        ticket("later", { firstResponseDueAt: at(115) }),
        ticket("sooner", { firstResponseDueAt: at(100) }),
      ],
      at(95),
      8,
    );
    expect(q.entries.map((e) => e.ticketId)).toEqual(["sooner", "later"]);
    expect(q.entries[0].minutes).toBe(5); // minutes REMAINING, not overdue
  });

  it("orders unassigned longest-waiting first", () => {
    const q = attentionQueue(
      [
        ticket("young", {
          assigneeId: null,
          createdAt: at(20),
          firstResponseDueAt: at(600),
          resolveDueAt: null,
        }),
        ticket("old", {
          assigneeId: null,
          createdAt: T0,
          firstResponseDueAt: at(600),
          resolveDueAt: null,
        }),
      ],
      at(80),
      8,
    );
    expect(q.entries.map((e) => e.ticketId)).toEqual(["old", "young"]);
    expect(q.entries[0].minutes).toBe(80);
    expect(q.entries[1].minutes).toBe(60);
  });

  it("truncates the entries but NEVER the totals", () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      ticket(`late-${i}`, { firstResponseDueAt: at(10 + i) }),
    );
    const q = attentionQueue(many, at(90), 2);
    expect(q.entries).toHaveLength(2);
    expect(q.totals.SLA_BREACHED).toBe(5);
  });

  it("keeps equal rows in a stable order between polls", () => {
    const twins = [
      ticket("b-twin", { firstResponseDueAt: at(30) }),
      ticket("a-twin", { firstResponseDueAt: at(30) }),
    ];
    const first = attentionQueue(twins, at(90), 8).entries.map((e) => e.ticketId);
    const second = attentionQueue([...twins].reverse(), at(90), 8).entries.map(
      (e) => e.ticketId,
    );
    expect(first).toEqual(second);
  });

  it("a breached ticket with no owner counts once, as a breach — same rule as the alarms", () => {
    const q = attentionQueue(
      [ticket("both", { assigneeId: null, firstResponseDueAt: at(10) })],
      at(90),
      8,
    );
    expect(q.entries).toHaveLength(1);
    expect(q.entries[0].kind).toBe("SLA_BREACHED");
    expect(q.totals.UNASSIGNED_WAITING).toBe(0);
  });
});
