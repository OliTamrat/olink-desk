# ADR 0021 — Ticket tabs, and the drafts that make them safe

- **Status:** Accepted
- **Date:** 2026-08-16
- **Context:** Founder, from the the global platforms agent-console screenshot: several open
  tickets as switchable tabs across the top. Agreed as its own scope rather
  than a layout tweak, because the tab strip is the small half of it.

## The strip is not the feature

An agent works several tickets at once — a customer goes quiet, a colleague is
asked, a refund is checked. the standard tabs are the visible answer to that. But
copying the row alone would have made this product **worse**, and that is the
decision worth recording.

Before this change, a half-written reply was thrown away by every ordinary way
of leaving a ticket: opening another one, pressing Back to list, reloading the
page. That was already a defect. It was survivable only because leaving a
ticket mid-reply was a deliberate act. **Tabs make leaving a ticket the normal
motion** — one click, many times an hour — so shipping the strip on top of a
composer that discards its contents would have turned an occasional loss into a
constant one.

So drafts came first, and the tabs are built on them. `localStorage`, keyed by
ticket id, holding the body and whether it was a reply or an internal note. A
draft survives switching, going back, and a full reload.

## Eviction is the rule that can lose work, so it is unit-tested

`packages/tickets/src/open-tabs.ts` — pure arithmetic, no imports at all, 11
tests. `apps/web` has no test script by design; anything worth a test belongs
in a package, and this is the part that could quietly delete a sentence
somebody wrote.

The cap is 8. At the cap the **least recently touched** tab is evicted — but
**never one holding an unsent reply**, whatever its age. If every tab holds
one, the strip goes *over* the cap rather than discard any of it. A crowded row
is a nuisance; a discarded draft is a loss, and the two are not comparable.

Closing follows from the same principle. A clean tab closes silently. A tab
with an unsent reply asks first — and only then, because a confirm on every
close teaches people to dismiss confirms. Whichever tab is closed, the
successor is the **right-hand neighbour, then the left, then nothing**: the
rule every browser already uses, so nobody has to learn ours.

## Two effects that would otherwise fight

Restoring a draft and saving one both run when `selectedId` changes, in the same
commit. Left alone, the save sees the **outgoing** ticket's text with the
**incoming** ticket's id — it writes one agent's sentence onto another
customer's ticket. A ref makes the restore silence exactly the one save that
follows it. This is the only genuinely subtle line in the change and the reason
it is written out here rather than left to a reader of the diff.

## The strip is on the list too, and not on the phone

**On the list**, because going back to the list is the commonest way to leave a
half-written reply — so that is precisely where the way back to it has to be
visible, along with the mark saying there is something to come back to.

**Not on the phone.** The bottom bar is already the navigation (ADR 0020); a
second scrolling row of destinations above the content would be a third. The
back button is the phone's answer, and it was already there.

## A client component must not import the package barrel

`@olink-desk/tickets` also exports `openTicket`, which reaches Prisma. A value
import of the barrel from `"use client"` code would try to bundle the database
client into the browser. `apps/web/src/lib/open-tickets.ts` imports the source
file — `@olink-desk/tickets/src/open-tabs` — in the one place that knows about
it, and re-exports. `open-tabs.ts` having no imports at all is what makes that
safe rather than lucky.

## Verified

25 browser checks against the production standalone build at 1600px and 390px.
The ones that matter: a draft survives switching away and back, a reload, and
the round trip through the list; the tab carrying it is marked and the others
are not; a clean tab closes silently while a dirty one asks, and declining
keeps both the tab and the text; sending clears the mark **and the reply is
actually on the ticket as an outbound message**; closing the active tab opens
its right-hand neighbour, read from the conversation on screen rather than from
the strip — a strip highlighting the right tab over the wrong conversation
would pass a check that only read the strip.

3 new strings in all six languages.
