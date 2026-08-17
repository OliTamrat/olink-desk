// Erasure: what a row becomes when the person it describes asks to be
// forgotten, and when a retention window comes due.
//
// The shape of every function here is the same: take a row, return the fields
// to write. Nothing performs the write, so what erasure MEANS is testable
// without a database — which matters more here than anywhere else in the
// product, because this is the one operation that cannot be checked by
// looking afterwards.

/**
 * A contact stripped of everything that identifies the person.
 *
 * Anonymise rather than delete. Deleting the row would take the tickets with
 * it (or orphan them), and with them last quarter's volume, SLA attainment
 * and satisfaction figures — so a supervisor's numbers would change
 * retroactively, with no explanation and no way to tell erasure apart from a
 * bug. What survives is a bare counter: an id, an organization, and the fact
 * that some person opened these tickets on these dates.
 *
 * `language` survives too, and deliberately: it is a property of the
 * conversation, not of the person, and the language mix is one of the few
 * reports that tells this market's operators something they cannot get
 * anywhere else.
 */
export interface ErasedContact {
  name: null;
  phone: null;
  email: null;
  telegramId: null;
  notes: null;
  smsConsent: false;
  erasedAt: Date;
}

export function erasedContact(now: Date): ErasedContact {
  return {
    name: null,
    phone: null,
    email: null,
    telegramId: null,
    notes: null,
    // Consent cannot outlive the address it was given for. Leaving this true
    // would let a later import re-attach a number to a row that is still
    // marked willing to receive messages.
    smsConsent: false,
    erasedAt: now,
  };
}

/**
 * A message with its words removed.
 *
 * The body becomes empty rather than a sentence. A stored tombstone would be
 * one language's sentence sitting in a product that serves six, and it would
 * be indistinguishable from a customer who actually wrote that sentence.
 * `redactedAt` is the flag a reader renders from, in their own language.
 */
export interface RedactedMessage {
  body: "";
  redactedAt: Date;
}

export function redactedMessage(now: Date): RedactedMessage {
  return { body: "", redactedAt: now };
}

/**
 * An attachment with its bytes removed.
 *
 * The filename goes too — "abebe-passport-scan.jpg" identifies a person and a
 * document as surely as the image does. `byteSize` stays: it is not personal
 * data, and it is what lets a storage report stay honest about what this desk
 * once held rather than silently reporting zero.
 */
export interface RedactedAttachment {
  data: Uint8Array;
  filename: "";
  redactedAt: Date;
}

export function redactedAttachment(now: Date): RedactedAttachment {
  return { data: new Uint8Array(0), filename: "", redactedAt: now };
}

/** Was this row already dealt with? Re-erasing would move the date. */
export function alreadyErased(row: { erasedAt: Date | null }): boolean {
  return row.erasedAt !== null;
}

export function alreadyRedacted(row: { redactedAt: Date | null }): boolean {
  return row.redactedAt !== null;
}
