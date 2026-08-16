import { describe, expect, it } from "vitest";

import { AT_RISK_FRACTION, slaState, tallyHealth } from "../src/state";

const T0 = new Date("2026-08-16T09:00:00Z");
const at = (mins: number) => new Date(T0.getTime() + mins * 60000);

// A ticket created at T0 with a 100-minute first-response promise.
const ticket = (over: Partial<Parameters<typeof slaState>[0]> = {}) => ({
  createdAt: T0,
  firstResponseDueAt: at(100),
  resolveDueAt: at(500),
  firstRespondedAt: null,
  ...over,
});

describe("slaState", () => {
  it("is ok early in the window", () => {
    const s = slaState(ticket(), at(10));
    expect(s.health).toBe("ok");
    expect(s.kind).toBe("first_response");
    expect(s.minutesRemaining).toBe(90);
  });

  it("turns at_risk exactly at the threshold, not after", () => {
    // The boundary is the whole point of the constant — a supervisor gets the
    // warning while there is still time to act, so an off-by-one here means
    // the alert lands after it stopped being useful.
    expect(slaState(ticket(), at(100 * AT_RISK_FRACTION - 1)).health).toBe("ok");
    expect(slaState(ticket(), at(100 * AT_RISK_FRACTION)).health).toBe("at_risk");
  });

  it("breaches at the due minute and stays breached", () => {
    expect(slaState(ticket(), at(99)).health).toBe("at_risk");
    expect(slaState(ticket(), at(100)).health).toBe("breached");
    expect(slaState(ticket(), at(10_000)).health).toBe("breached");
  });

  it("reports negative minutes once overdue", () => {
    expect(slaState(ticket(), at(130)).minutesRemaining).toBe(-30);
  });

  it("prefers the first-response clock while it is unmet", () => {
    // A desk that has not spoken to the customer at all is in worse trouble
    // than one that is merely late finishing. Surfacing the resolve clock
    // first would hide that.
    const s = slaState(ticket(), at(90));
    expect(s.kind).toBe("first_response");
    expect(s.dueAt).toEqual(at(100));
  });

  it("moves to the resolve clock once the first reply is out", () => {
    const s = slaState(ticket({ firstRespondedAt: at(20) }), at(90));
    expect(s.kind).toBe("resolve");
    expect(s.health).toBe("ok");
    expect(s.dueAt).toEqual(at(500));
  });

  it("a met first response does not breach on its old due date", () => {
    // The clock that was met must not keep ticking; otherwise every answered
    // ticket eventually reports breached and the escalation queue fills with
    // work that was done on time.
    const answered = ticket({ firstRespondedAt: at(20) });
    expect(slaState(answered, at(200)).health).toBe("ok");
    expect(slaState(answered, at(200)).kind).toBe("resolve");
  });

  it("a ticket with no SLA at all is ok, not breached", () => {
    // Tickets predating the SLA engine carry no due dates. Treating a missing
    // promise as a broken one would bury a real queue under history.
    const s = slaState(
      { createdAt: T0, firstResponseDueAt: null, resolveDueAt: null, firstRespondedAt: null },
      at(10_000),
    );
    expect(s.health).toBe("ok");
    expect(s.kind).toBeNull();
    expect(s.dueAt).toBeNull();
  });

  it("survives a due date equal to creation without dividing by zero", () => {
    // A zero-width window would make progress Infinity or NaN, and NaN >= x
    // is false, so a broken guard would silently report every such ticket as
    // healthy forever. The assertion is therefore "a real verdict and a real
    // number", not a particular verdict.
    const degenerate = {
      createdAt: T0,
      firstResponseDueAt: T0,
      resolveDueAt: null,
      firstRespondedAt: null,
    };
    expect(slaState(degenerate, T0).health).toBe("breached");

    // Asked for the state BEFORE the ticket existed — a nonsense input that
    // must still answer sanely rather than crash or return NaN.
    const before = slaState(degenerate, at(-5));
    expect(["ok", "at_risk", "breached"]).toContain(before.health);
    expect(Number.isFinite(before.minutesRemaining)).toBe(true);
  });
});

describe("tallyHealth", () => {
  it("counts each ticket once, in one bucket", () => {
    const rows = [
      ticket(),                                   // ok at t=10
      ticket({ firstResponseDueAt: at(5) }),      // breached at t=10
      ticket({ firstResponseDueAt: at(11) }),     // at risk at t=10
    ];
    expect(tallyHealth(rows, at(10))).toEqual({ atRisk: 1, breached: 1 });
  });

  it("is empty for an empty list rather than throwing", () => {
    expect(tallyHealth([], at(0))).toEqual({ atRisk: 0, breached: 0 });
  });
});
