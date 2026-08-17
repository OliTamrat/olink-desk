import { describe, expect, it } from "vitest";

import { coverage, MACRO_LANGUAGES } from "../src/coverage";

describe("coverage", () => {
  it("a fully written macro is complete and has nothing missing", () => {
    const bodies = Object.fromEntries(MACRO_LANGUAGES.map((l) => [l, "text"]));
    const c = coverage(bodies);
    expect(c.complete).toBe(true);
    expect(c.written).toBe(6);
    expect(c.missing).toEqual([]);
    expect(c.empty).toBe(false);
  });

  it("names what is missing, in canonical order", () => {
    // The list is the point. "4 of 6" makes the reader open the editor to
    // find out which two; naming them answers the question where it is asked.
    const c = coverage({ en: "hi", am: "ሰላም", so: "salaan", sw: "habari" });
    expect(c.written).toBe(4);
    expect(c.missing).toEqual(["om", "ti"]);
    expect(c.complete).toBe(false);
  });

  it("treats whitespace as unwritten", () => {
    expect(coverage({ en: "   ", am: "\n" }).written).toBe(0);
  });

  it("distinguishes a draft from a translation gap", () => {
    // "Missing six languages" is true of an empty macro and useless: it is a
    // draft nobody has started, not a nearly-finished one with holes.
    expect(coverage({}).empty).toBe(true);
    expect(coverage({ en: "hi" }).empty).toBe(false);
    expect(coverage(null).empty).toBe(true);
    expect(coverage(undefined).empty).toBe(true);
  });

  it("ignores languages the desk does not have", () => {
    const c = coverage({ en: "hi", fr: "bonjour", klingon: "nuqneH" });
    expect(c.written).toBe(1);
    expect(c.total).toBe(6);
  });
});
