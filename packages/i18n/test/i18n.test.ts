import { describe, expect, it } from "vitest";

import {
  allStrings,
  allUiStrings,
  detectLanguage,
  NOTES,
  SUPPORTED_LANGUAGES,
  t,
  tUi,
  UI_NOTES,
} from "../src/index";

// Both tables are held to the same three invariants — customer strings and
// console strings alike. The golden rule does not stop at the widget.
const TABLES: Array<{
  name: string;
  strings: Record<string, Record<string, string>>;
  notes: Record<string, string>;
}> = [
  { name: "strings", strings: allStrings(), notes: NOTES },
  { name: "ui_strings", strings: allUiStrings(), notes: UI_NOTES },
];

describe.each(TABLES)("string table $name", ({ strings, notes }) => {
  // The multilingual completion rule: a key that exists in English exists in
  // every language, in the same change. This test is what enforces it.
  it("every key exists in all six languages", () => {
    const enKeys = Object.keys(strings.en).sort();
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(Object.keys(strings[lang]).sort(), `language ${lang}`).toEqual(
        enKeys,
      );
    }
  });

  it("every key carries a reviewer note", () => {
    for (const key of Object.keys(strings.en)) {
      expect(notes[key], `note for ${key}`).toBeTruthy();
    }
  });

  // A translation that drops a placeholder renders a sentence missing its
  // ticket number. Placeholders must survive every language.
  it("placeholders match across languages", () => {
    for (const key of Object.keys(strings.en)) {
      const enPlaceholders = (strings.en[key].match(/\{\w+\}/g) ?? []).sort();
      for (const lang of SUPPORTED_LANGUAGES) {
        const got = (strings[lang][key].match(/\{\w+\}/g) ?? []).sort();
        expect(got, `${lang}.${key}`).toEqual(enPlaceholders);
      }
    }
  });
});

describe("tUi()", () => {
  it("interpolates and falls back to English like t()", () => {
    expect(tUi("en", "ui_tg_connected_as", { bot: "Olink_Desk_Bot" })).toContain(
      "Olink_Desk_Bot",
    );
    expect(tUi("fr", "ui_sign_in")).toEqual(tUi("en", "ui_sign_in"));
  });
});

describe("t()", () => {
  it("interpolates params", () => {
    expect(t("en", "ticket_opened", { org: "Acme", number: 42 })).toContain(
      "42",
    );
    expect(t("en", "ticket_opened", { org: "Acme", number: 42 })).toContain(
      "Acme",
    );
  });

  it("falls back to English for unsupported languages", () => {
    expect(t("fr", "greeting", { org: "Acme" })).toEqual(
      t("en", "greeting", { org: "Acme" }),
    );
    expect(t(null, "greeting", { org: "Acme" })).toEqual(
      t("en", "greeting", { org: "Acme" }),
    );
  });

  it("throws on unknown keys rather than rendering the key to a customer", () => {
    expect(() => t("en", "no_such_key")).toThrow();
  });
});

describe("detectLanguage", () => {
  it("Ethiopic script is Amharic unless the Tigrinya tell appears", () => {
    expect(detectLanguage("ሰላም እንዴት ነህ")).toBe("am");
    expect(detectLanguage("ሰላም ኣነ ሓገዝ እደሊ")).toBe("ti");
  });

  it("recognises Afaan Oromo, Somali and Swahili by marker words", () => {
    expect(detectLanguage("Akkam, gargaarsa barbaada")).toBe("om");
    expect(detectLanguage("Fadlan waxaan rabaa caawimaad")).toBe("so");
    expect(detectLanguage("Tafadhali nataka msaada na huduma")).toBe("sw");
  });

  it("unmarked Latin prose is English by elimination", () => {
    expect(detectLanguage("something entirely unrelated here")).toBe("en");
  });

  it("a short unmarked token carries no signal and must not flip the language", () => {
    expect(detectLanguage("ATM")).toBeNull();
    expect(detectLanguage("OK")).toBeNull();
    expect(detectLanguage("!!!")).toBeNull();
  });

  it("English words outrank a single shared local marker", () => {
    // "waan" appears in both the Oromo and Somali lists; surrounded by
    // English it must not hijack the detection.
    expect(detectLanguage("what does waan mean, can you tell me")).toBe("en");
  });
});
