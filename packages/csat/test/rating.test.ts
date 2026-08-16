import { describe, expect, it } from "vitest";

import {
  awaitingRating,
  parseRating,
  shouldSurvey,
  SURVEY_OPEN_HOURS,
} from "../src/rating";

describe("parseRating — what counts as a score", () => {
  it("reads a bare number in range", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(parseRating(String(n))).toBe(n);
    }
  });

  it("tolerates the punctuation people actually type", () => {
    expect(parseRating(" 4 ")).toBe(4);
    expect(parseRating("4.")).toBe(4);
    expect(parseRating("5!")).toBe(5);
    expect(parseRating("(3)")).toBe(3);
    expect(parseRating("2።")).toBe(2);
  });

  it("reads 'n/5'", () => {
    expect(parseRating("4/5")).toBe(4);
    expect(parseRating("5 / 5")).toBe(5);
    expect(parseRating("9/5")).toBeNull();
  });

  it("counts stars", () => {
    expect(parseRating("★★★")).toBe(3);
    expect(parseRating("⭐⭐⭐⭐⭐")).toBe(5);
    expect(parseRating("★".repeat(6))).toBeNull();
  });

  it("reads Ge'ez numerals", () => {
    // Rare in chat, but a customer who sends ፫ has unambiguously sent a 3,
    // and refusing it is a gap nobody would ever think to report.
    expect(parseRating("፫")).toBe(3);
    expect(parseRating("፭")).toBe(5);
  });

  it("rejects out-of-range numbers", () => {
    expect(parseRating("0")).toBeNull();
    expect(parseRating("6")).toBeNull();
    expect(parseRating("10")).toBeNull();
  });

  it("NEVER reads a longer number as a rating", () => {
    // An order number, an amount or a phone number is exactly the kind of
    // thing a customer sends right after being asked something. Reading "45"
    // as 4 would swallow it.
    expect(parseRating("45")).toBeNull();
    expect(parseRating("4521")).toBeNull();
    expect(parseRating("0911234567")).toBeNull();
  });

  it("NEVER reads a sentence as a rating, in any language", () => {
    // The asymmetry the whole design rests on: losing a rating costs a data
    // point, losing a question costs a customer. Anything with words in it is
    // a message.
    const messages = [
      "4 but the app is still broken",
      "my order 3 never arrived",
      "5 stars, thanks!",
      "ሰላም 3 ቀን ሆኖታል አልደረሰም",
      "waan 2 guyyaa eegaa jira",
      "waxaan sugayaa 4 maalmood",
      "nimesubiri siku 3",
      "no",
      "thanks",
      "አመሰግናለሁ",
    ];
    for (const m of messages) {
      expect(parseRating(m), `"${m}" was read as a rating`).toBeNull();
    }
  });

  it("rejects empty and whitespace", () => {
    expect(parseRating("")).toBeNull();
    expect(parseRating("   ")).toBeNull();
    expect(parseRating("\n")).toBeNull();
  });
});

describe("awaitingRating — is a survey open", () => {
  const sent = new Date("2026-08-16T09:00:00Z");
  const later = (h: number) => new Date(sent.getTime() + h * 3600000);

  it("is open inside the window", () => {
    expect(awaitingRating({ csatSentAt: sent, csatScore: null }, later(1))).toBe(true);
    expect(
      awaitingRating({ csatSentAt: sent, csatScore: null }, later(SURVEY_OPEN_HOURS)),
    ).toBe(true);
  });

  it("closes after the window, so a later number is a message", () => {
    expect(
      awaitingRating({ csatSentAt: sent, csatScore: null }, later(SURVEY_OPEN_HOURS + 1)),
    ).toBe(false);
  });

  it("closes once a score exists", () => {
    // Otherwise a customer who already rated could have a later "2" — plainly
    // a new message — swallowed as a second score.
    expect(awaitingRating({ csatSentAt: sent, csatScore: 5 }, later(1))).toBe(false);
  });

  it("is closed when no survey was ever sent", () => {
    expect(awaitingRating({ csatSentAt: null, csatScore: null }, later(1))).toBe(false);
  });
});

describe("shouldSurvey — who gets asked", () => {
  it("does NOT survey a ticket no person ever replied to", () => {
    // Asking "how did we do?" about an exchange the desk never took part in
    // reads as mockery, and would measure nothing.
    expect(shouldSurvey({ firstRespondedAt: null, csatSentAt: null })).toBe(false);
  });

  it("surveys a ticket a person actually answered", () => {
    expect(shouldSurvey({ firstRespondedAt: new Date(), csatSentAt: null })).toBe(true);
  });

  it("never asks the same ticket twice", () => {
    // Re-resolving a reopened ticket must not re-ask.
    expect(
      shouldSurvey({ firstRespondedAt: new Date(), csatSentAt: new Date() }),
    ).toBe(false);
  });
});
