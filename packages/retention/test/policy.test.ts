import { describe, expect, it } from "vitest";

import {
  auditWindowTooShort,
  cutoff,
  daysUntilErasure,
  KEEP_FOREVER,
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  policyProblems,
  ticketEligible,
  windowProblem,
} from "../src/policy";

const NOW = new Date("2026-08-17T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("window validation", () => {
  it("accepts keep-forever", () => {
    expect(windowProblem(KEEP_FOREVER)).toBeNull();
  });

  it("accepts the boundaries themselves, not just the inside", () => {
    expect(windowProblem(MIN_RETENTION_DAYS)).toBeNull();
    expect(windowProblem(MAX_RETENTION_DAYS)).toBeNull();
  });

  it("rejects a window short enough to destroy work in progress", () => {
    expect(windowProblem(MIN_RETENTION_DAYS - 1)).toBe("below_minimum");
    expect(windowProblem(7)).toBe("below_minimum");
  });

  it("rejects zero and negatives rather than reading them as forever", () => {
    // The dangerous confusion: 0 is not "keep nothing" and -1 is not "keep
    // forever". Both must be refused explicitly, because a form that posts
    // an empty field as 0 would otherwise erase a tenant's entire history.
    expect(windowProblem(0)).toBe("below_minimum");
    expect(windowProblem(-1)).toBe("below_minimum");
  });

  it("rejects a fractional day", () => {
    expect(windowProblem(90.5)).toBe("not_an_integer");
    expect(windowProblem(Number.NaN)).toBe("not_an_integer");
  });

  it("rejects beyond the maximum instead of silently clamping", () => {
    expect(windowProblem(MAX_RETENTION_DAYS + 1)).toBe("above_maximum");
  });
});

describe("the audit window cannot outlive the thing it records", () => {
  it("refuses an audit window shorter than the content window", () => {
    expect(
      auditWindowTooShort({ ticketRetentionDays: 365, auditRetentionDays: 90 }),
    ).toBe(true);
  });

  it("allows equal windows", () => {
    expect(
      auditWindowTooShort({ ticketRetentionDays: 365, auditRetentionDays: 365 }),
    ).toBe(false);
  });

  it("allows a longer audit window — the normal case", () => {
    expect(
      auditWindowTooShort({ ticketRetentionDays: 365, auditRetentionDays: 2555 }),
    ).toBe(false);
  });

  it("treats forever content as requiring forever audit", () => {
    // Content kept indefinitely with audit expiring in a year means that in
    // two years the tenant holds the tickets but no record of who touched
    // them. That is the shape of an audit gap, so it is refused.
    expect(
      auditWindowTooShort({
        ticketRetentionDays: KEEP_FOREVER,
        auditRetentionDays: 365,
      }),
    ).toBe(true);
    expect(
      auditWindowTooShort({
        ticketRetentionDays: KEEP_FOREVER,
        auditRetentionDays: KEEP_FOREVER,
      }),
    ).toBe(false);
  });

  it("is satisfied by a forever audit window whatever the content window", () => {
    expect(
      auditWindowTooShort({
        ticketRetentionDays: 30,
        auditRetentionDays: KEEP_FOREVER,
      }),
    ).toBe(false);
  });
});

describe("policyProblems", () => {
  it("is empty for the default — both forever", () => {
    expect(
      policyProblems({
        ticketRetentionDays: KEEP_FOREVER,
        auditRetentionDays: KEEP_FOREVER,
      }),
    ).toEqual([]);
  });

  it("names both fields when both are wrong", () => {
    const problems = policyProblems({
      ticketRetentionDays: 5,
      auditRetentionDays: 99_999,
    });
    expect(problems).toContain("ticket:below_minimum");
    expect(problems).toContain("audit:above_maximum");
  });

  it("does not compare two numbers it already refused", () => {
    // A 5-day content window against a 5-day audit window is consistent, but
    // reporting "audit is shorter than content" alongside "both are below the
    // minimum" would send an administrator chasing an ordering problem that
    // disappears the moment they fix the real one.
    const problems = policyProblems({
      ticketRetentionDays: 5,
      auditRetentionDays: 1,
    });
    expect(problems).not.toContain("audit:shorter_than_content");
  });
});

describe("cutoff", () => {
  it("has no cutoff for keep-forever, rather than a very old one", () => {
    // The failure this guards: returning the epoch would make a caller that
    // forgot the null check delete every row it looked at.
    expect(cutoff(KEEP_FOREVER, NOW)).toBeNull();
  });

  it("subtracts whole days", () => {
    expect(cutoff(90, NOW)?.toISOString()).toBe(daysAgo(90).toISOString());
  });
});

describe("eligibility is about closure, not age", () => {
  const before = cutoff(90, NOW);

  it("passes over an old ticket that is still open", () => {
    // The bug this exists for: keying on createdAt would destroy the history
    // of the longest-running, most-disputed matters on the desk — precisely
    // the ones somebody is still arguing about.
    expect(ticketEligible({ closedAt: null }, before)).toBe(false);
  });

  it("takes a ticket closed before the cutoff", () => {
    expect(ticketEligible({ closedAt: daysAgo(91) }, before)).toBe(true);
  });

  it("leaves a ticket closed after the cutoff", () => {
    expect(ticketEligible({ closedAt: daysAgo(89) }, before)).toBe(false);
  });

  it("takes nothing at all when the window is forever", () => {
    expect(ticketEligible({ closedAt: daysAgo(9999) }, null)).toBe(false);
  });
});

describe("daysUntilErasure", () => {
  it("is null when nothing will happen", () => {
    expect(daysUntilErasure({ closedAt: daysAgo(10) }, KEEP_FOREVER, NOW)).toBeNull();
    expect(daysUntilErasure({ closedAt: null }, 90, NOW)).toBeNull();
  });

  it("counts down", () => {
    expect(daysUntilErasure({ closedAt: daysAgo(49) }, 90, NOW)).toBe(41);
  });

  it("goes negative once overdue, so a screen can say so", () => {
    expect(daysUntilErasure({ closedAt: daysAgo(100) }, 90, NOW)).toBe(-10);
  });
});
