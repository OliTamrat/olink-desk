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
  phone: string;
  email: string | null;
  language: string;
  notes: string | null;
}

/**
 * Validate and normalise, or say what is wrong in words an agent can act on.
 *
 * A phone number is REQUIRED because it is the identity: without it there is
 * no way to recognise the same person on the next call, and a directory of
 * unrecognisable people is a list, not a record.
 */
export function cleanContact(
  input: ContactInput,
  fallbackLanguage: string,
): { ok: true; value: CleanContact } | { ok: false; error: string } {
  const rawPhone = typeof input.phone === "string" ? input.phone : "";
  if (!rawPhone.trim()) {
    return { ok: false, error: "A phone number is required — it is how the same person is recognised next time" };
  }
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return {
      ok: false,
      error: "That phone number was not recognised. Use 09… or 07…, or the full international form",
    };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `A name can be at most ${MAX_NAME_LENGTH} characters` };
  }

  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (email && !EMAIL_RE.test(email)) {
    return { ok: false, error: "That email address is not valid" };
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
  const existing = await db.contact.findFirst({
    where: { organizationId, phone: value.phone },
  });
  if (existing) {
    // Fill in blanks from what the agent just typed, but never overwrite:
    // whoever recorded the name first was talking to them, and a later caller
    // guessing a spelling must not quietly replace it.
    const patch: Record<string, string> = {};
    if (!existing.name && value.name) patch.name = value.name;
    if (!existing.email && value.email) patch.email = value.email;
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
