// Customers — the people behind the tickets.
//
// The `Contact` table has existed since the first migration and, until now,
// nothing in the product ever wrote a row to it. Every ticket that has ever
// arrived carries `contactId: null`, which is why the inbox says "Customer" in
// the requester column for all of them: a widget session id and a Telegram
// chat id are channel identities, not people, and nothing ever turned one into
// the other.
//
// So this is the identity layer, not a directory screen.
import type { Contact, PrismaClient } from "@olink-desk/database";

import { normalizePhone } from "./phone";

/** Two identities that already belong to two different people. */
export class ContactConflictError extends Error {}

export const MAX_NAME_LENGTH = 120;
export const MAX_NOTES_LENGTH = 2000;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LANGUAGES = ["en", "am", "om", "ti", "so", "sw"];

export interface ContactInput {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  language?: string | null;
  notes?: string | null;
}

export interface CleanContact {
  name: string | null;
  phone: string | null;
  email: string | null;
  language: string;
  notes: string | null;
}

/**
 * Validate and normalise, or say what is wrong in words an agent can act on.
 *
 * AT LEAST ONE of phone or email is required, because one of them has to be
 * the identity: without either there is no way to recognise the same person
 * next time, and a directory of unrecognisable people is a list, not a record.
 *
 * This used to demand a phone number. That was right while every channel was
 * phone-first and wrong as a universal — an email customer has no phone, and
 * refusing to record them would have meant email tickets could never belong
 * to anybody.
 */
export function cleanContact(
  input: ContactInput,
  fallbackLanguage: string,
): { ok: true; value: CleanContact } | { ok: false; error: string } {
  const rawPhone = typeof input.phone === "string" ? input.phone.trim() : "";
  let phone: string | null = null;
  if (rawPhone) {
    phone = normalizePhone(rawPhone);
    if (!phone) {
      return {
        ok: false,
        error: "That phone number was not recognised. Use 09… or 07…, or the full international form",
      };
    }
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `A name can be at most ${MAX_NAME_LENGTH} characters` };
  }

  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (email && !EMAIL_RE.test(email)) {
    return { ok: false, error: "That email address is not valid" };
  }

  // One of them, or there is nothing to recognise this person by next time.
  if (!phone && !email) {
    return {
      ok: false,
      error: "A phone number or an email address is required — it is how the same person is recognised next time",
    };
  }

  const language =
    typeof input.language === "string" && LANGUAGES.includes(input.language)
      ? input.language
      : fallbackLanguage;

  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (notes.length > MAX_NOTES_LENGTH) {
    return { ok: false, error: `Notes can be at most ${MAX_NOTES_LENGTH} characters` };
  }

  return {
    ok: true,
    value: {
      name: name || null,
      phone,
      email: email || null,
      language,
      notes: notes || null,
    },
  };
}

/**
 * Find this person, or record them.
 *
 * Creating rather than finding is the failure that matters here, and it is
 * silent: two agents taking calls from the same customer must land on the same
 * record, or the second one sees no history and the customer explains
 * themselves twice. The unique constraint on (organizationId, phone) is what
 * makes that true, and `cleanContact` normalising first is what makes the
 * constraint mean anything.
 *
 * `created` is returned rather than inferred by the caller, because "we
 * already knew this person" is worth showing an agent.
 */
export async function findOrCreateContact(
  db: PrismaClient,
  organizationId: string,
  value: CleanContact,
): Promise<{ contact: Contact; created: boolean }> {
  // Matched on EITHER identity, not just the preferred one. Looking up by
  // phone alone meant a customer already on file by email was not found, and
  // the create then hit the unique index — so adding a phone number to
  // somebody first met by email failed outright.
  const candidates = [
    ...(value.phone ? [{ phone: value.phone }] : []),
    ...(value.email ? [{ email: value.email }] : []),
  ];
  const matches = await db.contact.findMany({
    where: { organizationId, OR: candidates },
  });

  // Both identities were given and they belong to two DIFFERENT people. Doing
  // anything here would either merge two customers or silently pick one, so
  // it refuses and leaves the decision with a person.
  if (matches.length > 1) {
    throw new ContactConflictError(
      "That phone number and that email address already belong to two different customers",
    );
  }
  const existing = matches[0] ?? null;
  if (existing) {
    // Fill in blanks from what the agent just typed, but never overwrite:
    // whoever recorded the name first was talking to them, and a later caller
    // guessing a spelling must not quietly replace it.
    const patch: Record<string, string> = {};
    if (!existing.name && value.name) patch.name = value.name;
    if (!existing.email && value.email) patch.email = value.email;
    // A customer first met by email who then rings in gains a phone number,
    // and vice versa. This is how one person stops being two records across
    // two channels.
    if (!existing.phone && value.phone) patch.phone = value.phone;
    if (Object.keys(patch).length === 0) return { contact: existing, created: false };
    const contact = await db.contact.update({ where: { id: existing.id }, data: patch });
    return { contact, created: false };
  }

  const contact = await db.contact.create({
    data: {
      organizationId,
      phone: value.phone,
      name: value.name,
      email: value.email,
      language: value.language,
      notes: value.notes,
    },
  });
  return { contact, created: true };
}
