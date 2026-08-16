import { describe, expect, it } from "vitest";

import {
  AT_RISK_FROM,
  isPriority,
  priorityIsNotable,
  priorityTone,
  rowTone,
  slaReading,
  type SlaClock,
} from "../src/urgency";

const NOW = Date.parse("2026-08-16T12:00:00Z");
const at = (ms: number) => new Date(NOW + ms).toISOString();
const HOUR = 3_600_000;

const ticket = (over: Partial<SlaClock> = {}): SlaClock => ({
  status: "OPEN",
  createdAt: at(-HOUR),
  firstRespondedAt: null,
  firstResponseDueAt: at(HOUR),
  resolveDueAt: at(8 * HOUR),
  ...over,
});

describe("priority", () => {
  it("colours only the priorities worth acting on", () => {
    expect(priorityTone("URGENT")).toBe("danger");
    expect(priorityTone("HIGH")).toBe("warn");
    // The point of the rail is that most rows do NOT have one. A colour on
    // every row carries no information.
    expect(priorityTone("NORMAL")).toBe("neutral");
    expect(priorityTone("LOW")).toBe("neutral");
    expect(priorityIsNotable("NORMAL")).toBe(false);
    expect(priorityIsNotable("LOW")).toBe(false);
  });

  it("an unknown priority is quiet rather than alarming", () => {
    // A value from a future migration must not paint the list red.
    expect(priorityTone("CATASTROPHIC")).toBe("neutral");
    expect(isPriority("CATASTROPHIC")).toBe(false);
    expect(isPriority("URGENT")).toBe(true);
  });
});

describe("the SLA clock", () => {
  it("a fresh ticket is on track", () => {
    const r = slaReading(ticket(), NOW);
    expect(r?.state).toBe("ok");
    expect(r?.tone).toBe("info");
    expect(r?.ms).toBe(HOUR);
  });

  it("a breach is danger, not the same amber as at-risk", () => {
    // The distinction the whole display exists to make. These were one colour
    // before: "twenty minutes left" and "an hour late" looked identical.
    const soon = slaReading(
      ticket({ createdAt: at(-9 * HOUR), firstResponseDueAt: at(HOUR) }),
      NOW,
    );
    const late = slaReading(ticket({ firstResponseDueAt: at(-HOUR) }), NOW);
    expect(soon?.state).toBe("soon");
    expect(soon?.tone).toBe("warn");
    expect(late?.state).toBe("breached");
    expect(late?.tone).toBe("danger");
    expect(soon?.tone).not.toBe(late?.tone);
  });

  it("turns at-risk at the stated fraction of the window, not before", () => {
    // A 10-hour window, so the threshold lands on a whole hour.
    const window = 10 * HOUR;
    const justUnder = slaReading(
      ticket({
        createdAt: at(-(AT_RISK_FROM * window - HOUR)),
        firstResponseDueAt: at(window - (AT_RISK_FROM * window - HOUR)),
      }),
      NOW,
    );
    const justOver = slaReading(
      ticket({
        createdAt: at(-(AT_RISK_FROM * window + HOUR)),
        firstResponseDueAt: at(window - (AT_RISK_FROM * window + HOUR)),
      }),
      NOW,
    );
    expect(justUnder?.state).toBe("ok");
    expect(justOver?.state).toBe("soon");
  });

  it("reports elapsed time once breached, not a negative remainder", () => {
    const r = slaReading(ticket({ firstResponseDueAt: at(-2 * HOUR) }), NOW);
    expect(r?.ms).toBe(2 * HOUR);
  });

  it("measures the first reply until one has been sent, then resolution", () => {
    const waiting = slaReading(ticket(), NOW);
    expect(waiting?.key).toBe("ui_sla_first_due");
    const answered = slaReading(ticket({ firstRespondedAt: at(-30 * 60_000) }), NOW);
    expect(answered?.key).toBe("ui_sla_resolve_due");
    expect(answered?.ms).toBe(8 * HOUR);
  });

  it("a finished ticket has no live clock", () => {
    // Leaving one amber forever after it was answered is how a wallboard
    // stops meaning anything.
    for (const status of ["RESOLVED", "CLOSED"]) {
      expect(slaReading(ticket({ status, firstResponseDueAt: at(-HOUR) }), NOW)).toBeNull();
    }
  });

  it("a ticket with no promise on it shows nothing", () => {
    expect(
      slaReading(ticket({ firstResponseDueAt: null, resolveDueAt: null }), NOW),
    ).toBeNull();
  });

  it("an unparseable date shows nothing rather than NaN", () => {
    expect(slaReading(ticket({ firstResponseDueAt: "not a date" }), NOW)).toBeNull();
    expect(slaReading(ticket({ createdAt: "" }), NOW)).toBeNull();
  });
});

describe("the row's one colour", () => {
  it("an ordinary ticket on time has none", () => {
    expect(rowTone("NORMAL", slaReading(ticket(), NOW))).toBeNull();
    expect(rowTone("LOW", slaReading(ticket(), NOW))).toBeNull();
  });

  it("a breached clock outranks any priority", () => {
    // A broken promise is a fact; a priority is an opinion. Showing amber
    // HIGH on a row whose clock ran out red buries the thing to do next.
    const late = slaReading(ticket({ firstResponseDueAt: at(-HOUR) }), NOW);
    expect(rowTone("LOW", late)).toBe("danger");
    expect(rowTone("HIGH", late)).toBe("danger");
    expect(rowTone("URGENT", late)).toBe("danger");
  });

  it("an urgent ticket still shows red while its clock is fine", () => {
    expect(rowTone("URGENT", slaReading(ticket(), NOW))).toBe("danger");
  });

  it("an at-risk clock and a high priority agree, and neither is lost", () => {
    const soon = slaReading(
      ticket({ createdAt: at(-9 * HOUR), firstResponseDueAt: at(HOUR) }),
      NOW,
    );
    expect(rowTone("NORMAL", soon)).toBe("warn");
    expect(rowTone("HIGH", soon)).toBe("warn");
    // Urgent is louder than at-risk, so it survives.
    expect(rowTone("URGENT", soon)).toBe("danger");
  });

  it("a ticket with no clock still shows its priority", () => {
    expect(rowTone("URGENT", null)).toBe("danger");
    expect(rowTone("HIGH", null)).toBe("warn");
    expect(rowTone("NORMAL", null)).toBeNull();
  });
});
