import { describe, expect, it } from "vitest";

import { cleanContact } from "../src/contacts";

describe("cleanContact", () => {
  it("requires SOMETHING to recognise them by next time", () => {
    const r = cleanContact({ name: "Selam Bekele" }, "am");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/phone number or an email/i);
  });

  it("accepts an email-only customer, because that is all an email customer has", () => {
    // This is the rule that changed when email became a channel. Demanding a
    // phone number would have meant an email ticket could never belong to
    // anybody.
    const r = cleanContact({ name: "Hana", email: "hana@example.com" }, "en");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.phone).toBeNull();
      expect(r.value.email).toBe("hana@example.com");
    }
  });

  it("still refuses a phone number it cannot recognise, even alongside a good email", () => {
    // The email would be enough on its own — but a number that was typed and
    // is wrong must be corrected, not silently dropped.
    const r = cleanContact({ phone: "12345", email: "hana@example.com" }, "en");
    expect(r.ok).toBe(false);
  });

  it("normalises the phone before it is ever stored", () => {
    const r = cleanContact({ name: "Selam", phone: "0911 234 567" }, "am");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phone).toBe("+251911234567");
  });

  it("names the problem in words an agent can act on", () => {
    const r = cleanContact({ phone: "12345" }, "am");
    expect(r.ok).toBe(false);
    // Not "invalid input" — it says what a good number looks like.
    if (!r.ok) expect(r.error).toMatch(/09|07|international/i);
  });

  it("treats a blank name as no name rather than an empty string", () => {
    const r = cleanContact({ name: "   ", phone: "0911234567" }, "am");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.name).toBeNull();
  });

  it("falls back to the workspace language, never to English by assumption", () => {
    const r = cleanContact({ phone: "0911234567" }, "om");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.language).toBe("om");

    const bogus = cleanContact({ phone: "0911234567", language: "fr" }, "om");
    expect(bogus.ok).toBe(true);
    if (bogus.ok) expect(bogus.value.language).toBe("om");
  });

  it("accepts each of the six languages", () => {
    for (const lang of ["en", "am", "om", "ti", "so", "sw"]) {
      const r = cleanContact({ phone: "0911234567", language: lang }, "en");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.language).toBe(lang);
    }
  });

  it("rejects an email that is not one, and lowercases the ones that are", () => {
    expect(cleanContact({ phone: "0911234567", email: "not an email" }, "en").ok).toBe(false);
    const r = cleanContact({ phone: "0911234567", email: "Selam@Example.COM" }, "en");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.email).toBe("selam@example.com");
  });

  it("caps the free-text fields so one paste cannot fill a column", () => {
    expect(cleanContact({ phone: "0911234567", name: "x".repeat(121) }, "en").ok).toBe(false);
    expect(cleanContact({ phone: "0911234567", notes: "x".repeat(2001) }, "en").ok).toBe(false);
  });
});
