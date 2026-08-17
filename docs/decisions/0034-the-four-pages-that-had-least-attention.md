# ADR 0034 — The four pages that had had the least attention

- **Status:** Accepted
- **Date:** 2026-08-17
- **Context:** I named Inbox, Customers, Channels and Settings as the pages
  most likely to hold the next complaint, and the founder replied "fix them
  all and you have my approval." So: screenshots first, with real data on
  them, then fixes.

## Channels was a wall of forms

Ten channels, **every credential form expanded at once**, 4,200px of scroll.
Reaching USSD meant scrolling past nine forms nobody was filling in. This is
the same "overcrowded" complaint that produced the collapsible rails, on a
page I never applied it to.

An admin connects **one** channel at a time. The page now looks like that
decision: one card per channel showing its icon, name, status and blurb, with
the form revealed only when it is opened — and opening one **closes the last**,
so the page cannot grow back into the wall it replaced.

**The blurb stays visible when closed.** It is what an admin reads to decide
whether to open that one at all; hiding it would turn the list into ten names.

4,200px → **1,371px**, and a check asserts it: `document.body.scrollHeight <
1800`, plus zero `input` elements before a channel is chosen.

## Customers still had the ADR 0028 empty state

One muted line at the top-left of a box, with seven hundred pixels of nothing
under it — the exact shape of a panel that failed to load, and the exact defect
removed from the wallboard two ADRs ago.

**It survived because the sweep in ADR 0029 measured CARDS**, and this is not
one. That is now three times a sweep has been blind to the thing it was built
to find, always for the same reason: the check knows one shape and the defect
wore another. `ui_customers_none` becomes the sentence under a real title.

## Settings held the last bare headings

Five `<h2>`s with no icon tile — every other card in the console has one, which
is what made this page read as a different product. They now match.

## Inbox came back clean

Nothing to fix. Recorded because "I checked and it was fine" is information,
and the next session should not re-audit it on a hunch.

## Verified

13 browser checks against the production standalone build: the channels page's
own height, that no form is open before one is chosen, that opening a second
closes the first, that a closed channel still describes itself, that the
customers empty state is centred with equal room above and below, that it is a
title plus a sentence rather than one line, that no settings heading is bare,
and no horizontal overflow on any of the four at 390px.

1 new string in all six languages (442 keys each).
