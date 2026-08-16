# ADR 0015 — Customers: the identity layer, not a directory screen

- **Status:** Accepted
- **Date:** 2026-08-16
- **Context:** Manual ticket creation was the goal. Building it surfaced
  something larger underneath it.

## What was actually wrong

`Contact` has been in the schema since the first migration. `Ticket.contactId`
is selected by every list query. The inbox has a **Requester** column.

And **nothing in the product had ever written a `Contact` row.** Every ticket
that had ever arrived carried `contactId: null`, so the requester column said
"Customer" for all of them — a widget session id and a Telegram chat id are
channel identities, not people, and nothing ever turned one into the other.

The desk did not know who anybody was, and never learned, no matter how many
times the same person wrote in. That is why this is filed as the identity
layer rather than as a customer directory: the screen is the visible part.

## A phone number is the identity, so it is normalised or refused

`Contact` is unique on `(organizationId, phone)`. That constraint is
**decorative** unless the number is normalised first: `+251911234567`,
`0911234567` and `0911 234 567` are one customer, and three rows means the
third agent to take their call sees none of the history.

Same lesson as tags (ADR 0011) — normalise at the boundary, once, so the thing
can be joined on. `normalizePhone` handles the six ways an Ethiopian number
gets typed (including Ge'ez digits, which are on Amharic keyboards) and keeps
foreign numbers as themselves.

**It refuses what it cannot recognise, rather than guessing.** A five-digit
short code, a half-typed number, a 13-digit account number: stored as an
identity, each becomes a row that will never match that person again — worse
than making the agent fix the typo. Guessing wrong is the failure that cannot
be seen from inside, because the duplicate looks like a new customer.

Two rules found by writing the tests first:
- The local form is **exactly ten characters** (0 + the 9-digit national
  number). An earlier range of nine-or-ten accepted `091123456` — one digit
  short — and gave that typo a permanent record.
- Display is `0911 234 567`, not `+251911234567`. Staff read 09… off a form
  and say it on a call; the international form makes the desk feel foreign for
  the sake of a storage format. `displayPhone` round-trips through
  `normalizePhone`, and the **ticket rail and the directory use the same
  one** — the first build had the rail showing the stored form while the
  directory showed the spoken one, which reads as two different numbers.

## Find-or-create, never create-and-hope

Two agents taking calls from the same customer must land on one record. The
API reports `created: false` back to the console so the agent is told "you
already had this person" rather than wondering why their typed name did not
stick.

A later caller's spelling **never overwrites** a name already on file: whoever
recorded it first was talking to them. Blanks get filled in; nothing gets
replaced.

## A logged call has no conversation, and the desk says so three times

This is the honesty that makes manual tickets safe to ship.

A ticket created from a phone call has `conversationId: null` — there is no
channel identity, so there is genuinely nothing to send to. The console
therefore:

1. **warns on the form**, before the ticket exists, while the agent is still
   deciding what to promise the customer;
2. **warns above the composer** on the ticket itself;
3. **disables Send.** A warning plus a live-looking button is still a composer
   that fails on submit — which is the exact thing the warning was supposed to
   prevent. An **internal note stays enabled**: it is for colleagues and never
   leaves the desk.

This is the same `undeliverable` case bulk macros learned to name (ADR 0014),
and it now has one answer everywhere.

## Opening a ticket is one door

`openTicket()` moved out of the channel spine into `packages/tickets`. Number
allocation (max+1, retry on the unique violation rather than locking) and
starting the SLA clocks are **ticket lifecycle, not a channel concern** — and
a second copy is a second place for one of them to drift, quietly, in whichever
copy is used less. Email will be a third creator.

A manually logged ticket gets **SLA clocks like any other**. Otherwise the
busiest desks would report their best numbers by taking work off the channels
entirely.

## What the agent said is recorded as the CUSTOMER's words

The description on the form is written to the timeline as an **INBOUND**
message. Recording an agent's summary of a call as outbound would make the
timeline claim the desk said it.

## Naming a ticket that arrived anonymously

The rail on any contact-less ticket offers "Name this customer", and doing so
also writes the contact onto the **conversation** — so the customer's *next*
message arrives already attached to them, instead of being re-identified by
hand every time. The drive proves that with a second widget message.

## Personal data stays out of the logs

Audit rows record that a contact was created or updated and which fields
changed — never the name, the number or the email. Same rule the two reports
follow (ADR 0012).

## A count is a label, not an inflected noun

The directory first rendered "1 tickets". Embedding a count inside a noun
phrase needs plural rules, and they differ across all six languages, so an
inflected English form would be wrong in most of them. It reads `Tickets: 3`
in every language instead. Related to the Bank Assist lesson that a sentence
built from fragments is not translatable — here the fix is to not build the
sentence.

## Verified

18 unit tests on the pure logic (the six-forms-one-person case, the
one-digit-short typo, the account-number false positive, Ge'ez digits, the
display round-trip) and 28 browser checks against the production standalone
build, including that the same number typed two ways lands on one record, that
an unrecognisable number is refused, that Send is disabled rather than merely
warned about, that an internal note still works, that the customer's next
message arrives already named, that another workspace sees none of it, and
that a read-only auditor can read the directory but record nothing.

## Not built, deliberately

- **No reply-by-SMS on a logged call.** Tempting — the agent has the number —
  but it would send from a channel the customer never opted into, and no SMS
  aggregator is connected yet. When SMS is live this becomes a deliberate
  "text them" action, not a silent transport swap behind the same composer.
- **No merge for duplicates already created.** Nothing has created any yet,
  because nothing has created contacts at all. It becomes worth building once
  a real desk has been running long enough to make some.
