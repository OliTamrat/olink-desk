# 0038 — Erasure anonymises the person, it does not delete the record

**Status:** accepted · 2026-08-17

## Context

Proclamation 1321/2024 gives a data subject the right to have their personal
data deleted, and support tickets are personal data. A desk that cannot honour
an erasure request is not sellable to a bank, and the obligation is the first
question of every enterprise security review.

The obvious implementation is `DELETE FROM Contact WHERE id = …`, cascading to
their tickets. It is wrong, and the reason is not technical.

## Decision

**A contact is anonymised; the row survives. Message bodies and attachment
bytes are emptied; those rows survive too. Audit rows are the only thing
genuinely deleted, and only by the retention window.**

An erasure writes:

| Row | What happens |
|---|---|
| `Contact` | `name`, `phone`, `email`, `telegramId`, `notes` → null; `smsConsent` → false; `erasedAt` set |
| `TicketMessage` | `body` → `""`, `redactedAt` set |
| `Attachment` | `data` → empty, `filename` → `""`, `redactedAt` set; `byteSize` untouched |
| `Conversation` | `contactId` → null (a Telegram chat id is a durable handle on the same person) |
| `Ticket` | untouched |

## Why not delete

**Deleting the tickets silently rewrites history that other people rely on.**
Last quarter's volume, SLA attainment, satisfaction and channel mix are all
counted from ticket rows. If a customer exercises a right in August, a
supervisor's July report changes in August — with no explanation, and
indistinguishable from a bug. The organisation would learn to distrust its own
numbers, which is a worse outcome than the one the deletion was meant to avoid.

Once the row holds no name, no number, no address and no words, it is not
personal data. It is a count: *some person opened a ticket on this channel on
this date and it was resolved in four hours.* That is what a desk is entitled
to keep, and keeping it costs the data subject nothing.

## Three consequences that look like details

**The body becomes `""`, not a sentence.** A stored `[deleted]` would be one
language's text in a product that serves six, and would be indistinguishable
from a customer who actually typed it. `redactedAt` is the flag; the tombstone
is rendered from the i18n table in the reader's own language.

**`byteSize` survives on an attachment.** It is not personal data, and zeroing
it would make a storage report claim the desk never held the file — a different
and untrue statement from "it is gone".

**A redacted attachment answers 410, not a zero-byte download.** An empty file
lands on the agent's disk as a corrupt image and reads as a bug in the upload
rather than as a policy that ran.

## Alternatives rejected

- **Hard delete with cascade** — rewrites reports, as above.
- **Soft-delete flag on the contact, content left in place** — not erasure. The
  words the customer wrote are the personal data; hiding them behind a boolean
  leaves them in the database and in every backup.
- **Delete the messages rather than empty them** — deleting rows changes the
  first-response time that was computed from them, and leaves a conversation
  whose shape is a lie: an agent reading it cannot tell whether the customer
  was answered.
