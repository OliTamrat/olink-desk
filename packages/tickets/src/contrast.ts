// WCAG 2.1 relative luminance and contrast ratio.
//
// Here rather than in the web app because a palette is a claim — "every rung
// of the text ladder clears 4.5:1 on its own background" — and a claim in a
// comment is not checked. `apps/web` has no test script by design, so the
// arithmetic lives in a package and the palettes are asserted against it.

/** `#rgb`, `#rrggbb` or `#rrggbbaa` → [r, g, b] in 0–255. Alpha is dropped. */
export function parseHex(hex: string): [number, number, number] {
  const h = hex.trim().replace(/^#/, "");
  const full =
    h.length === 3 || h.length === 4
      ? h
          .slice(0, 3)
          .split("")
          .map((c) => c + c)
          .join("")
      : h.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`not a hex colour: ${hex}`);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** 1 (identical) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA for body text. Large text (≥18.66px bold / 24px) needs only 3. */
export const AA_TEXT = 4.5;
/** WCAG AA for a control's own boundary against what surrounds it. */
export const AA_NON_TEXT = 3;
