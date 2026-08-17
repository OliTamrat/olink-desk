# ADR 0007 — Macros render in the customer's language, not the agent's

- **Status:** Accepted
- **Date:** 2026-08-16
- **Context:** the global platforms parity work. Macros (canned replies) are the largest
  single agent-speed win in any desk product, and the one place Desk can
  beat the benchmark outright rather than match it.

## Decision

A macro is **one object carrying a body per language**, and applying it to a
ticket renders **the language the customer is writing in** — never the
language the agent's console happens to be set to.

`Macro.bodies` is `JSONB`, a map of language code to text, rather than one
column per language or one row per translation. A macro is edited as a
single object, and adding a seventh language to the fleet must not need a
migration.

## Why this is the load-bearing part

Every competitor's macro is monolingual: an agent picks the English macro
because the console is in English, and an Amharic customer gets an English
reply. In a market where the native-language gap **is** the moat (the Bank
Assist strategic note, applied to support tooling), shipping monolingual
macros would hand that advantage away for a shortcut.

This is the Bank Assist sign-in-card lesson in a different costume: the
panel's language and the conversation's language are two different things,
and conflating them is how a Tigrinya customer gets answered in Amharic.

Resolution order is: the conversation's sticky language, then the ticket's
own language (for a walk-in or a phone call with no conversation row), then
the workspace default, then English, then **any body that exists at all**.
That last step is deliberate — a macro authored only in Amharic must hand
over the Amharic body rather than an empty composer, because an empty box
reads as a broken button, not as a missing translation. Whenever the body
served is not the language asked for, the reply carries `fellBack: true`
and the composer shows an amber warning naming **the customer's** language.

## What is deliberately refused

1. **Applying a macro does not send.** It fills the composer; the agent
   presses send. A one-click write-and-deliver means the first person to
   read the sentence is the customer. It is also what makes the fallback
   warning useful — it is readable *before* delivery, not after.
2. **The macro's status change lands after delivery, not on insert.** A
   ticket must never read RESOLVED because somebody opened a draft and
   walked away.
3. **Placeholders are a closed set** — `customer.name`, `ticket.number`,
   `agent.name`, `organization.name`. An open "any field on the ticket"
   placeholder reads as more powerful and is actually a leak: it would let
   a macro author address a customer with an internal note or an
   assignee's email. Widening it is a decision someone makes on purpose.
4. **An unknown placeholder is refused at save time**, which is the only
   moment a person is looking at the macro. Accepting it would mean
   silently deleting it from every reply afterwards.
5. **No raw `{{token}}` ever reaches the composer.** A missing customer
   name resolves to a *translated* form of address; anything else
   unresolvable is removed and the whitespace collapsed. The whole point
   of a macro is that the agent does not read the draft closely.
6. **Applying a macro forces the composer back to public reply**, so bank
   copy cannot silently become an internal note nobody sends.

A regression test found that the first token regex only matched
`word.word`, so `{{nope}}` and `{{not.a.field}}` passed straight through
both the renderer *and* save-time validation to the customer. It matches
any `{{…}}` now. Worth recording because reading the file did not find it —
driving it did.

## Starter macros, and why seeding is guarded on zero

A workspace gets three starters on first visit, in all six languages. An
empty macros page teaches nothing: an agent cannot tell what a macro is for
from a blank list, and an admin does not learn that a body can be written
six times until they see one that is.

Seeding is guarded on the workspace having **no macros at all**, not on
each starter being present. An admin who deletes a starter because it does
not suit their desk must not find it resurrected on the next page load —
per-row upserting would do exactly that, and it reads as the product
overruling a deliberate decision.

`createMany({ skipDuplicates: true })` rather than upsert, for the same
reason the SLA seeder uses it: Prisma's upsert still raises P2002 under
real concurrency, and two agents opening a fresh workspace at once both
find zero macros.

## Language status

EN and AM composed; OM/TI/SO/SW drafted against Bank Assist's reviewed
sentence patterns and carried into the linguist review sheet. A curated
macro is prose sent **verbatim** with no model in the path, so — exactly as
with Bank Assist's curated answers — the reviewer's sign-off matters more
here than for console chrome. Drafting all six immediately is still right;
waiting for a human to author from a blank sheet is how a language never
ships at all.

## Verified

Driven in a browser against the production standalone build, asserting
consequences rather than pixels: an English console on a Tigrinya ticket
produced a Ge'ez draft; the customer's widget feed contained nothing until
send was pressed; the status applied only after delivery; the fallback
warning named Soomaali before sending; another workspace's real macro id
did not resolve. Ten checks, all passing.

The screenshot caught what the assertions could not — the edit button was
labelled "Save", because the wrong i18n key was reused. Render the page
before believing the UI.
