# ADR 0025 — Macros that do things, and a knowledge base with something in it

- **Status:** Accepted
- **Date:** 2026-08-16
- **Context:** Founder, from a live workspace: enhance the Macros page and copy
  Zendesk's new-macro creation process, and add a few knowledge-base articles
  so the feature can be seen working.

## A macro was a canned reply with one dropdown bolted on

Zendesk's model — and the one an agent actually wants — is a small **bundle of
actions**: send this text, set the status, set the priority, add these tags.
Doing three more things by hand after every canned reply is exactly the
repetition a macro exists to remove.

So the editor is now a **list you add to**, not a fixed row of fields. That
difference is not cosmetic. A fixed field asserts "every macro has a status" —
which is why a dropdown reading *Leave unchanged* sat on every macro in the
workspace, a control that did nothing on most of them. A list says "this macro
does these three things", which is what an admin is deciding, and it leaves
room for a fourth action without a redesign.

Each action is offered **once**: a second "set status" row would be two
controls fighting over one column.

## CLOSED and NEW are not settable

`cleanActions` refuses them whatever the caller sends. A macro is prose an
agent fires in one click:

- **CLOSED** would end a conversation the customer is still in.
- **NEW** would walk a ticket backwards past its own first-response clock.

An agent who genuinely wants either can still do it from the properties rail,
where it is a considered act rather than a side effect of picking a reply.

## Nothing happens until the reply is actually delivered

The existing rule for status, extended to all three. Picking a macro fills the
composer and changes **nothing** on the ticket; the actions run after the send
succeeds. A ticket must never read RESOLVED because somebody opened a draft and
walked away.

**And never for an internal note.** A note is a message to colleagues, not an
answer to anybody — resolving a ticket because an agent left themselves a
reminder would be a lie told to the wallboard. Both halves are driven in the
browser, because neither is visible from a test of the action model.

## Tags are slugged, deduped and capped

`Billing`, ` billing `, and `BILLING` are one tag. Case and spacing minting a
second tag is how a filter silently splits in two. Ethiopic survives slugging —
a latin-only rule turns an Amharic tag into an empty string, and the macro then
appears to add a tag and adds none.

## The list says what each macro does

A column of titles tells an agent nothing about which macro also resolves the
ticket, and finding that out by sending one is expensive.

**The value has to be translated before it is interpolated.** The first build
rendered "Sets status to RESOLVED" — a raw enum dropped into the middle of a
sentence, so an Amharic reader got an English constant in Amharic prose. No
test of the action model could see that; it was caught by looking at the page,
and the drive now asserts the Amharic line contains no English at all.

`describeActions` returns **keys and parameters, never assembled sentences**.
A line built by concatenating fragments only reads correctly in a language
whose word order matches English, and three of our six do not.

## Four starter articles, unpublished

"No articles yet" is true and useless. It cannot show that an article carries a
title **and** a body in six languages, that publishing is a separate decision
from writing, or that deflections are the number worth watching. Four real rows
say all three at a glance.

Same discipline as the starter macros, and for a stronger reason — **an article
is shown to customers**. So they are deliberately generic: no opening hours, no
response time, no policy, no promise a real business has not made. Every one
answers a question about how the desk itself works, which is true of every desk.

**They arrive unpublished.** Seeding published articles would put words in front
of a bank's customers that nobody at that bank has read. The admin's publish
click is the review.

Seeded lazily on first read, like `ensureStarterMacros`: a workspace created
before this gets them too, and a workspace that deleted them never gets them
back.

## Verified

23 browser checks against the production standalone build. The ones that
matter are consequences, not appearances: building three actions in the editor
and finding them on the ticket after a send; finding **nothing** on the ticket
after picking the macro but before sending; and finding nothing at all after
sending it as an internal note.

Migration `20260816220000_macro_actions` — both columns nullable or defaulted,
so every macro written before this keeps working and simply takes no extra
action. 10 new strings in all six languages.
