import { describe, expect, it } from "vitest";

import {
  cleanActions,
  describeActions,
  hasActions,
  MAX_TAGS,
  NO_ACTIONS,
  tagSlug,
} from "../src/actions";

describe("cleanActions", () => {
  it("keeps the three statuses a macro may set", () => {
    for (const s of ["OPEN", "PENDING", "RESOLVED"]) {
      expect(cleanActions({ setStatus: s }).setStatus).toBe(s);
    }
  });

  it("refuses CLOSED and NEW, whatever the caller sends", () => {
    // A macro is prose fired in one click. Closing a ticket outright ends a
    // conversation the customer is still in; setting NEW walks it backwards
    // past its own first-response clock. Both stay in the properties rail,
    // where they are a considered act.
    expect(cleanActions({ setStatus: "CLOSED" }).setStatus).toBeNull();
    expect(cleanActions({ setStatus: "NEW" }).setStatus).toBeNull();
  });

  it("refuses anything that is not a status at all", () => {
    for (const junk of ["", "open", "Resolved", 3, null, {}]) {
      expect(cleanActions({ setStatus: junk }).setStatus).toBeNull();
    }
  });

  it("keeps the four priorities and refuses the rest", () => {
    for (const p of ["LOW", "NORMAL", "HIGH", "URGENT"]) {
      expect(cleanActions({ setPriority: p }).setPriority).toBe(p);
    }
    expect(cleanActions({ setPriority: "CRITICAL" }).setPriority).toBeNull();
    expect(cleanActions({ setPriority: "high" }).setPriority).toBeNull();
  });

  it("normalises, dedupes and orders tags", () => {
    const a = cleanActions({ addTags: ["Billing", " billing ", "Late Delivery", "BILLING"] });
    // Case and spacing must not mint a second tag that splits a filter in two.
    expect(a.addTags).toEqual(["billing", "late-delivery"]);
  });

  it("accepts a comma-separated string, which is how a person types a list", () => {
    expect(cleanActions({ addTags: "billing, refund ,, vip" }).addTags).toEqual([
      "billing",
      "refund",
      "vip",
    ]);
  });

  it("keeps Ethiopic tags rather than slugging them away to nothing", () => {
    // A latin-only slug rule silently turns an Amharic tag into an empty
    // string, and the macro then appears to add a tag and adds none.
    expect(tagSlug("ክፍያ")).toBe("ክፍያ");
    expect(cleanActions({ addTags: ["ክፍያ", "ዘገየ ማድረስ"] }).addTags).toEqual([
      "ክፍያ",
      "ዘገየ-ማድረስ",
    ]);
  });

  it("caps the list so one macro cannot bury a ticket in labels", () => {
    const many = Array.from({ length: 40 }, (_, i) => `tag-${i}`);
    expect(cleanActions({ addTags: many }).addTags).toHaveLength(MAX_TAGS);
  });

  it("truncates a tag rather than storing an essay", () => {
    expect(tagSlug("x".repeat(200))).toHaveLength(32);
  });

  it("survives junk without throwing", () => {
    for (const junk of [null, undefined, "nonsense", 7, [], { addTags: 5 }]) {
      expect(() => cleanActions(junk)).not.toThrow();
    }
    expect(cleanActions(null)).toEqual(NO_ACTIONS);
    expect(cleanActions({ addTags: [1, true, null, "ok"] }).addTags).toEqual(["ok"]);
  });
});

describe("hasActions", () => {
  it("is false for a macro that only sends words", () => {
    expect(hasActions(NO_ACTIONS)).toBe(false);
  });

  it("is true as soon as any one action is set", () => {
    expect(hasActions(cleanActions({ setStatus: "OPEN" }))).toBe(true);
    expect(hasActions(cleanActions({ setPriority: "HIGH" }))).toBe(true);
    expect(hasActions(cleanActions({ addTags: ["billing"] }))).toBe(true);
  });
});

describe("describeActions", () => {
  it("returns keys and parameters, never assembled sentences", () => {
    // A line built by concatenating fragments only reads correctly in a
    // language whose word order matches English, and three of our six do not.
    const lines = describeActions(
      cleanActions({ setStatus: "PENDING", setPriority: "HIGH", addTags: ["billing", "vip"] }),
    );
    expect(lines.map((l) => l.key)).toEqual([
      "ui_macro_does_status",
      "ui_macro_does_priority",
      "ui_macro_does_tags",
    ]);
    expect(lines[2].params).toEqual({ n: 2, list: "billing, vip" });
  });

  it("says nothing about actions a macro does not take", () => {
    expect(describeActions(NO_ACTIONS)).toEqual([]);
    expect(describeActions(cleanActions({ setPriority: "URGENT" }))).toHaveLength(1);
  });
});
