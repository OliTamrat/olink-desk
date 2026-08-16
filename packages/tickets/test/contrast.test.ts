// The palettes, checked by arithmetic.
//
// A theme is the one kind of change whose defects are invisible to the person
// making it: I read every screen on one monitor, and "looks fine" is not a
// measurement. Light themes fail differently from dark ones — a muted grey
// that is comfortably readable on near-black is often the first thing to go
// under 4.5:1 on near-white — so both are held to the same numbers here
// rather than one being checked and the other assumed.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AA_NON_TEXT, AA_TEXT, contrast, luminance, parseHex } from "../src/contrast";

// Read from the app's token file rather than duplicated here: a copy would
// pass forever after somebody edited the real palette.
const THEME_SRC = readFileSync(
  join(__dirname, "..", "..", "..", "apps", "web", "src", "lib", "theme.ts"),
  "utf-8",
);

function palette(name: "dark" | "light"): Record<string, string> {
  const start = THEME_SRC.indexOf(`  ${name}: {`);
  expect(start, `${name} palette not found in theme.ts`).toBeGreaterThan(-1);
  const end = THEME_SRC.indexOf("\n  },", start);
  const body = THEME_SRC.slice(start, end);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(\w+):\s*"(#[0-9a-fA-F]{3,8})"/g)) out[m[1]] = m[2];
  return out;
}

const THEMES = (["dark", "light"] as const).map((name) => ({ name, p: palette(name) }));

describe("contrast maths", () => {
  it("matches the WCAG reference points", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // Symmetric — the ratio does not care which is foreground.
    expect(contrast("#1d4ed8", "#ffffff")).toBeCloseTo(contrast("#ffffff", "#1d4ed8"), 10);
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
    expect(luminance("#000000")).toBeCloseTo(0, 5);
  });

  it("reads short and alpha-suffixed hex", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("#5b9dff55")).toEqual([91, 157, 255]);
    expect(() => parseHex("var(--accent)")).toThrow();
  });
});

describe.each(THEMES)("$name palette", ({ p }) => {
  it("parsed a full palette rather than an empty one", () => {
    // Without this, a regex that stopped matching would make every assertion
    // below vacuously pass — the check measuring nothing and reporting green.
    expect(Object.keys(p).length).toBeGreaterThan(20);
  });

  // The ladder, on each surface it is actually drawn on. textMuted is the
  // rung that fails first and the one used most (72 call sites).
  it.each(["textPrimary", "textBody", "textSecondary", "textMuted"])(
    "%s clears AA on bg, surface and surfaceRaised",
    (rung) => {
      for (const ground of ["bg", "surface", "surfaceRaised", "surfaceHover"]) {
        expect(
          contrast(p[rung], p[ground]),
          `${rung} on ${ground}`,
        ).toBeGreaterThanOrEqual(AA_TEXT);
      }
    },
  );

  it("a label on a filled button is readable", () => {
    // This is the pair that forced two accent tokens: in the dark theme the
    // text tint cannot carry white at 4.5:1, so the fill has to be darker.
    expect(contrast(p.onAccent, p.accentSolid)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("the accent is readable as text, which is most of what it is", () => {
    for (const ground of ["bg", "surface", "surfaceRaised", "surfaceHover"]) {
      expect(contrast(p.accent, p[ground]), `accent on ${ground}`).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    }
  });

  it.each(["success", "warn", "danger", "info"])(
    "%s is readable as text on the surfaces it labels",
    (status) => {
      for (const ground of ["bg", "surface", "surfaceRaised"]) {
        expect(contrast(p[status], p[ground]), `${status} on ${ground}`).toBeGreaterThanOrEqual(
          AA_TEXT,
        );
      }
    },
  );

  it.each(["success", "warn", "danger", "info"])(
    "%s is readable on its own tinted background",
    (status) => {
      expect(contrast(p[status], p[`${status}Bg`])).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it("a card edge is visible against the page", () => {
    // Not 4.5 — a rule is not text. But a border that disappears is a card
    // that stops being a card, which is exactly how a light theme built from
    // a dark one goes wrong.
    expect(contrast(p.border, p.bg)).toBeGreaterThanOrEqual(1.2);
    expect(contrast(p.borderStrong, p.surface)).toBeGreaterThanOrEqual(1.4);
  });

  it("a focused control's outline is visible", () => {
    expect(contrast(p.accent, p.surface)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});

describe("the two themes are actually two themes", () => {
  it("light is light and dark is dark", () => {
    const [dark, light] = [palette("dark"), palette("light")];
    expect(luminance(dark.bg)).toBeLessThan(0.1);
    expect(luminance(light.bg)).toBeGreaterThan(0.7);
  });

  it("every token exists in both, so no corner falls back to unstyled", () => {
    const [dark, light] = [palette("dark"), palette("light")];
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });
});
