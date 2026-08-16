# ADR 0016 — The customer record, and what we deliberately do not copy

- **Status:** Accepted
- **Date:** 2026-08-16
- **Context:** ADR 0015 built the identity layer. Comparing the result against
  Zendesk's customer page (founder screenshots, 2026-08-16) separated three
  different things: work I left half-done, a real product gap, and features
  that are Zendesk carrying weight this product does not have.

## Two things were half-shipped, and that is the important part

- **`Contact.notes`** was in the schema, validated in `cleanContact`, and had
  **no field anywhere in the console to type one.**
- **`PATCH /api/contacts/[id]`** existed, worked, and **had no caller.** A
  misspelled name was permanent.

This is the Bank Assist failure repeated: *a complete table with dead call
sites*. Both looked finished from the inside — schema green, route tested,
typecheck clean — because everything that measured them was measuring the
wrong end. The checks in the drive for this change are deliberately written
against the **call sites**: type into the field, press the button, then read
the database.

## A customer is a page, not an expander

The directory listed people and expanded one inline. That means no URL — an
agent cannot send a colleague a link to a person, and the back button does
nothing. `/customers/[id]` is a real route, which is also what the founder's
drill-down instruction asks for everywhere.

It carries what a page can and a row cannot: **counts** (open now / all time,
counted in SQL rather than derived from the 25 most recent tickets — a
customer with 40 would otherwise report a total of 25, wrong quietly and
forever), **notes**, **editing**, and **"Log a ticket for them"**.

That last one exists because the alternative is an indignity: an agent who
just clicked on a person should not then be asked who is calling. The button
carries `?contact=<id>` and the form arrives filled in.

## Editing is held to the identity rules, both of them

An edit goes through the same `cleanContact` a create does, so a number the
create path would refuse cannot arrive through the edit path.

And moving a customer onto a number that already belongs to somebody else is
refused with **409**, not left to fail on the unique constraint. Silently
merging two people is the worst outcome this table can produce.

## Notes say who can see them

An agent unsure whether the customer can read a note writes nothing useful.
The field says plainly: staff only, never shown to the customer.

## What we are NOT copying from Zendesk, and why

Recorded so the next session does not read these as oversights:

- **Organizations** (Zendesk's "Org." — customers belonging to a company).
  Genuinely valuable for B2B desks and worth building. It needs a new model
  and a migration, and the name collides with our `Organization` = tenant, so
  it is a decision rather than a field. **Roadmap, not oversight.**
- **"+ add contact"** (several emails and phones per person). A second phone
  is common in Ethiopia — but the phone **is** our identity key, so "which one
  identifies them" is a design question. Adding a secondary number without
  answering it would quietly reintroduce the duplicate problem ADR 0015
  closed.
- **Time zone.** Ethiopia is one timezone. This is Zendesk carrying global
  weight. It becomes real the day a tenant operates outside EAT, and not
  before.
- **User type / Access / Security settings / Help center tab.** All of these
  configure Zendesk's **end-user portal** — customer logins, what a customer
  may see of their own tickets. This product has no customer login; a customer
  reaches us on Telegram or a widget and is identified by the channel. Copying
  the fields would be copying an architecture we deliberately do not have.
- **Merging duplicates.** Deferred in ADR 0015 and still deferred: nothing has
  created duplicates yet, and a merge tool built before there is anything to
  merge is a guess about which record wins.

## Verified

18 browser checks against the production standalone build, weighted at the
call sites: that a directory row opens a page at its own URL, that the counts
exclude resolved tickets from "open now", that a misspelled name can be
corrected, that a note typed into the field reaches the database **and comes
back onto the page**, that an edit is refused the same numbers a create is,
that taking another customer's number returns 409, that logging a ticket from
their page attaches to them without creating a second record, that the ticket
rail links through, and that an auditor is not shown buttons that would refuse
them.
