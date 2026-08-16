import { describe, expect, it } from "vitest";

import { MAX_TAG_LENGTH, tagDisplayName, tagError, tagSlug } from "../src/tags";

describe("tagSlug — what makes two tags the same", () => {
  it("folds case and trims", () => {
    expect(tagSlug("Refund")).toBe("refund");
    expect(tagSlug("  refund  ")).toBe("refund");
    expect(tagSlug("REFUND")).toBe("refund");
  });

  it("unifies the three ways people write a two-word label", () => {
    // The actual failure this prevents: a desk with "Failed payment",
    // "failed_payment" and "failed-payment" as three tags produces a report
    // that is quietly wrong.
    const forms = ["Failed payment", "failed_payment", "failed-payment", "Failed  Payment"];
    const slugs = new Set(forms.map(tagSlug));
    expect(slugs.size).toBe(1);
    expect([...slugs][0]).toBe("failed-payment");
  });

  it("drops punctuation people type around a label", () => {
    expect(tagSlug("refund!")).toBe("refund");
    expect(tagSlug("(urgent)")).toBe("urgent");
    expect(tagSlug("delivery.")).toBe("delivery");
  });

  it("keeps letters in every script we serve", () => {
    // Ge'ez must survive normalisation unchanged — a rule that strips
    // non-ASCII would silently make every Amharic tag the same empty slug.
    expect(tagSlug("ክፍያ")).toBe("ክፍያ");
    expect(tagSlug("  ክፍያ  ")).toBe("ክፍያ");
    expect(tagSlug("Kaffaltii")).toBe("kaffaltii");
    expect(tagSlug("ክፍያ ጉዳይ")).toBe("ክፍያ-ጉዳይ");
  });

  it("keeps digits", () => {
    expect(tagSlug("tier 2")).toBe("tier-2");
  });

  it("does NOT stem", () => {
    // "refund" and "refunds" stay distinct. Stemming would silently merge
    // labels a person chose on purpose, and unlike a spelling variant there
    // is no way for them to tell it happened.
    expect(tagSlug("refund")).not.toBe(tagSlug("refunds"));
  });

  it("collapses and strips stray hyphens", () => {
    expect(tagSlug("a -- b")).toBe("a-b");
    expect(tagSlug("-refund-")).toBe("refund");
  });
});

describe("tagDisplayName — what a person sees", () => {
  it("keeps the casing they chose", () => {
    expect(tagDisplayName("Failed Payment")).toBe("Failed Payment");
  });

  it("tidies whitespace without flattening the name", () => {
    expect(tagDisplayName("  Failed   Payment ")).toBe("Failed Payment");
  });

  it("truncates rather than rejecting silently", () => {
    expect(tagDisplayName("x".repeat(100))).toHaveLength(MAX_TAG_LENGTH);
  });
});

describe("tagError", () => {
  it("refuses an empty name", () => {
    expect(tagError("")).toMatch(/needs a name/);
    expect(tagError("   ")).toMatch(/needs a name/);
  });

  it("refuses a name that is all punctuation", () => {
    // It would normalise to the empty slug and collide with every other
    // such name on the unique constraint.
    expect(tagError("!!!")).toMatch(/no letters or numbers/);
    expect(tagError("---")).toMatch(/no letters or numbers/);
  });

  it("refuses an over-long name", () => {
    expect(tagError("x".repeat(MAX_TAG_LENGTH + 1))).toMatch(/at most/);
  });

  it("accepts ordinary tags in every language", () => {
    for (const t of ["refund", "Failed payment", "ክፍያ", "Kaffaltii", "tier 2"]) {
      expect(tagError(t), t).toBeNull();
    }
  });
});
