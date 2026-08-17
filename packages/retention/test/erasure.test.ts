import { describe, expect, it } from "vitest";

import {
  alreadyErased,
  alreadyRedacted,
  erasedContact,
  redactedAttachment,
  redactedMessage,
} from "../src/erasure";

const NOW = new Date("2026-08-17T12:00:00Z");

describe("erasedContact", () => {
  const erased = erasedContact(NOW);

  it("clears every field that identifies a person", () => {
    // Enumerated rather than spot-checked. A field added to Contact and not
    // added here is the exact failure this guards: an erasure that reports
    // success while leaving the customer's Telegram id on file.
    expect(erased.name).toBeNull();
    expect(erased.phone).toBeNull();
    expect(erased.email).toBeNull();
    expect(erased.telegramId).toBeNull();
    expect(erased.notes).toBeNull();
  });

  it("withdraws SMS consent, because consent cannot outlive the number", () => {
    expect(erased.smsConsent).toBe(false);
  });

  it("records when, so the erasure is itself auditable", () => {
    expect(erased.erasedAt).toEqual(NOW);
  });

  it("does not touch the fields a report is built from", () => {
    // The row survives as a bare counter. Nothing here names id,
    // organizationId, createdAt or language — the write must leave them
    // alone, and a key appearing here would silently overwrite one.
    expect(Object.keys(erased).sort()).toEqual([
      "email",
      "erasedAt",
      "name",
      "notes",
      "phone",
      "smsConsent",
      "telegramId",
    ]);
  });
});

describe("redactedMessage", () => {
  it("empties the body rather than storing a sentence", () => {
    // A stored "[deleted]" would be one language's text in a six-language
    // product, and indistinguishable from a customer who typed it.
    expect(redactedMessage(NOW).body).toBe("");
  });

  it("flags the row so a reader can render the tombstone", () => {
    expect(redactedMessage(NOW).redactedAt).toEqual(NOW);
  });

  it("changes nothing else about the turn", () => {
    expect(Object.keys(redactedMessage(NOW)).sort()).toEqual([
      "body",
      "redactedAt",
    ]);
  });
});

describe("redactedAttachment", () => {
  const redacted = redactedAttachment(NOW);

  it("empties the bytes", () => {
    expect(redacted.data.length).toBe(0);
  });

  it("clears the filename, which identifies as surely as the file", () => {
    expect(redacted.filename).toBe("");
  });

  it("leaves byteSize alone — it is not personal data", () => {
    // Zeroing it would make a storage report claim this desk never held the
    // file, which is a different and untrue statement from "it is gone".
    expect(Object.keys(redacted)).not.toContain("byteSize");
  });
});

describe("idempotence", () => {
  it("recognises a row that was already dealt with", () => {
    expect(alreadyErased({ erasedAt: NOW })).toBe(true);
    expect(alreadyErased({ erasedAt: null })).toBe(false);
    expect(alreadyRedacted({ redactedAt: NOW })).toBe(true);
    expect(alreadyRedacted({ redactedAt: null })).toBe(false);
  });
});
