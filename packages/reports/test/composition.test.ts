import { describe, expect, it } from "vitest";

import { composition, LIFECYCLE } from "../src/composition";

const sum = (s: { percent: number }[]) => s.reduce((a, b) => a + b.percent, 0);

describe("composition", () => {
  it("counts every state and folds resolved and closed into one", () => {
    const { total, slices } = composition({
      NEW: 4, OPEN: 10, PENDING: 3, RESOLVED: 20, CLOSED: 7,
    });
    expect(total).toBe(44);
    expect(slices.map((s) => s.key)).toEqual([...LIFECYCLE]);
    expect(slices.find((s) => s.key === "DONE")?.count).toBe(27);
  });

  it("shares always add up to 100", () => {
    // Four independently rounded numbers routinely sum to 99 or 101, and a
    // panel whose percentages do not add up is one nobody trusts with the
    // counts either. Largest-remainder is what stops that.
    for (const c of [
      { NEW: 1, OPEN: 1, PENDING: 1, RESOLVED: 0 },
      { NEW: 1, OPEN: 1, PENDING: 1, RESOLVED: 1 },
      { NEW: 2, OPEN: 3, PENDING: 5, RESOLVED: 7 },
      { NEW: 856, OPEN: 4, PENDING: 10, RESOLVED: 27 },
      { NEW: 333, OPEN: 333, PENDING: 333, RESOLVED: 1 },
      { NEW: 1, OPEN: 0, PENDING: 0, RESOLVED: 0 },
    ]) {
      expect(sum(composition(c).slices), JSON.stringify(c)).toBe(100);
    }
  });

  it("never gives a percentage point to a state with nothing in it", () => {
    // The failure mode of naive largest-remainder: an empty state shows 1%
    // and the reader goes looking for the ticket that is not there.
    const { slices } = composition({ NEW: 1, OPEN: 1, PENDING: 0, RESOLVED: 0 });
    expect(slices.find((s) => s.key === "PENDING")?.percent).toBe(0);
    expect(slices.find((s) => s.key === "DONE")?.percent).toBe(0);
    expect(sum(slices)).toBe(100);
  });

  it("keeps a row for every state, including the empty ones", () => {
    // "Pending 0" is information: the desk has that state and nothing is in
    // it. Dropping empty rows makes the list change shape as work moves
    // through it, which is exactly when somebody is reading it.
    const { slices } = composition({ NEW: 3 });
    expect(slices).toHaveLength(4);
    expect(slices.filter((s) => s.count === 0)).toHaveLength(3);
  });

  it("an empty workspace is all zeroes, not a division by zero", () => {
    const { total, slices } = composition({});
    expect(total).toBe(0);
    expect(slices.every((s) => s.count === 0 && s.percent === 0)).toBe(true);
    expect(slices.every((s) => Number.isFinite(s.percent))).toBe(true);
  });

  it("ignores nonsense rather than propagating it", () => {
    const { total, slices } = composition({ NEW: -5, OPEN: 10 } as never);
    expect(total).toBe(10);
    expect(slices.find((s) => s.key === "NEW")?.count).toBe(0);
  });

  it("every row knows where it drills to", () => {
    const { slices } = composition({ NEW: 1, OPEN: 1, PENDING: 1, RESOLVED: 1 });
    expect(slices.find((s) => s.key === "NEW")?.href).toContain("status=NEW");
    // Done covers two statuses, so it uses the view that already means both
    // rather than a status filter that would only catch half of it.
    expect(slices.find((s) => s.key === "DONE")?.href).toContain("view=solved");
  });
});
