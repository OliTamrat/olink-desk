// How much of a macro is actually written.
//
// The macros list used to answer this with six coloured pills per card — one
// per language, all shouting, and the reader still had to COUNT them to learn
// anything. The question an admin has is "is this one finished, and if not
// what is missing", which is a sentence, not a colour swatch.

export const MACRO_LANGUAGES = ["en", "am", "om", "ti", "so", "sw"] as const;
export type MacroLanguage = (typeof MACRO_LANGUAGES)[number];

export interface Coverage {
  written: number;
  total: number;
  /** Language codes with no body, in canonical order. */
  missing: MacroLanguage[];
  complete: boolean;
  /** Nothing written at all — a different problem from a partial one. */
  empty: boolean;
}

export function coverage(bodies: Record<string, string> | null | undefined): Coverage {
  const has = (l: MacroLanguage) => Boolean((bodies?.[l] ?? "").trim());
  const missing = MACRO_LANGUAGES.filter((l) => !has(l));
  const written = MACRO_LANGUAGES.length - missing.length;
  return {
    written,
    total: MACRO_LANGUAGES.length,
    missing,
    complete: missing.length === 0,
    // A macro with no body anywhere is a draft, not a translation gap, and
    // saying "missing 6 languages" about it is technically true and useless.
    empty: written === 0,
  };
}
