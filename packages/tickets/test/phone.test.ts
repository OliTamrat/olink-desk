import { describe, expect, it } from "vitest";

import { displayPhone, normalizePhone } from "../src/phone";

describe("normalizePhone", () => {
  it("reads the same Ethiopian mobile written six different ways as one person", () => {
    // This is the whole point of the function. If any of these disagree, the
    // customer gets a second record and the agent sees none of their history.
    const forms = [
      "0911234567",
      "0911 234 567",
      "091-123-4567",
      "+251911234567",
      "251911234567",
      "00251911234567",
    ];
    const normalised = new Set(forms.map((f) => normalizePhone(f)));
    expect([...normalised]).toEqual(["+251911234567"]);
  });

  it("handles Safaricom Ethiopia's 07 range, not just 09", () => {
    expect(normalizePhone("0712345678")).toBe("+251712345678");
    expect(normalizePhone("712345678")).toBe("+251712345678");
  });

  it("keeps foreign numbers as themselves rather than forcing them Ethiopian", () => {
    expect(normalizePhone("+1 240 744 7761")).toBe("+12407447761");
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("reads Ge'ez digits, because Amharic keyboards have them", () => {
    // ፱፩፩ = 911
    expect(normalizePhone("0፱፩፩፪፫፬፭፮፯")).toBe("+251911234567");
  });

  it("REFUSES what it cannot recognise rather than guessing", () => {
    // Each of these, stored as an identity, would be a row that never matches
    // the same person again — worse than making the agent fix the typo.
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone("12345")).toBeNull(); // short code or half-typed
    expect(normalizePhone("hello")).toBeNull();
    expect(normalizePhone("091123456")).toBeNull(); // one digit short
    expect(normalizePhone("+2519112345678901234")).toBeNull(); // past E.164
  });

  it("does not mistake an account number for a phone number", () => {
    // A 13-digit CBE account number is the classic false positive: it is all
    // digits and about the right length to look plausible.
    expect(normalizePhone("1000234567890")).toBeNull();
  });

  it("rejects a number with letters spliced into it", () => {
    expect(normalizePhone("0911-CALL-ME")).toBeNull();
  });
});

describe("displayPhone", () => {
  it("shows an Ethiopian number the way it is said out loud", () => {
    // Staff read 09… off a form and say it on a call. Showing +251 9… makes
    // the desk feel foreign for the sake of a storage format.
    expect(displayPhone("+251911234567")).toBe("0911 234 567");
  });

  it("leaves a foreign number in international form, where it belongs", () => {
    expect(displayPhone("+12407447761")).toBe("+12407447761");
  });

  it("round-trips: what is displayed normalises back to what is stored", () => {
    const stored = "+251911234567";
    expect(normalizePhone(displayPhone(stored))).toBe(stored);
  });
});
