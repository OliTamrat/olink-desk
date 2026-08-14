import { describe, expect, it } from "vitest";

import {
  allStrings,
  detectLanguage,
  NOTES,
  SUPPORTED_LANGUAGES,
  t,
} from "../src/index";

describe("string tables", () => {
  // The multilingual completion rule: a key that exists in English exists in
  // every language, in the same change. This test is what enforces it.
  it("every key exists in all five languages", () => {
    const strings = allStrings();
    const enKeys = Object.keys(strings.en).sort();
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(Object.keys(strings[lang]).sort(), `language ${lang}`).toEqual(
        enKeys,
      );
    }
  });

  it("every key carries a reviewer note", () => {
    for (const key of Object.keys(allStrings().en)) {
      expect(NOTES[key], `note for ${key}`).toBeTruthy();
    }
  });

  // A translation that drops a placeholder renders a sentence missing its
  // ticket number. Placeholders must survive every language.
  it("placeholders match across languages", () => {
    const strings = allStrings();
    for (const key of Object.keys(strings.en)) {
      const enPlaceholders = (strings.en[key].match(/\{\w+\}/g) ?? []).sort();
      for (const lang of SUPPORTED_LANGUAGES) {
        const got = (strings[lang][key].match(/\{\w+\}/g) ?? []).sort();
        expect(got, `${lang}.${key}`).toEqual(enPlaceholders);
      }
    }
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
    expect(t("sw", "greeting", { org: "Acme" })).toEqual(
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

  it("recognises Afaan Oromo and Somali by marker words", () => {
    expect(detectLanguage("Akkam, gargaarsa barbaada")).toBe("om");
    expect(detectLanguage("Fadlan waxaan rabaa caawimaad")).toBe("so");
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
