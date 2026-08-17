# ADR 0035 — A page per channel, listed in the rail

- **Status:** Accepted
- **Date:** 2026-08-17
- **Context:** Founder: "On channels I wish you port Olink Assist approach.
  All channels are listed as sub channels inside the sidebar and when you click
  each channel it will open a dedicated channel page."

## Why this is better than the accordion it replaces

ADR 0034 collapsed ten open forms into ten cards that expand in place. That
fixed the scroll and left the real problem: **connecting a channel is a job,
and a job needs an address.**

Connecting WhatsApp and connecting SMS happen on different days, usually by
whoever holds that provider's account. With a page each:

- the URL can be sent to that person;
- the browser's back button works;
- the screen shows one set of credentials rather than nine collapsed
  neighbours;
- and moving between channels is one click in the rail rather than a scroll
  and an expand.

## The sub-nav is static, and only appears in its own section

`CHANNEL_NAV` is a constant. The rail renders on every page, and a sub-nav
that waited on `/api/channels` would either flash in after paint or make every
screen in the console pay for a request it does not use. **Which channels
exist is a fact about the code**; what varies per workspace is each one's
*status*, and that belongs on the page.

It renders **only when Channels is the section in view**. Nine permanent extra
rows in a nine-row rail is the crowding this console has spent three ADRs
removing, not adding. It is hidden entirely when the rail is folded to 56px —
indented sub-items at that width are unreadable and unmissable at the same
time.

## The bug the screenshot caught, and the general form

The container was given `display: var(--rail-open)`. That variable exists for
the two chevron glyphs and resolves to **`inline-flex`** — so the nine channel
names became flex children in a single clipped row.

Every check still passed: there were nine sub-items, they linked correctly,
the right one was marked active. **Counting the items never asks whether they
are stacked.** The fix is a variable of its own (`--rail-sub`: `grid` open,
`none` folded), and the checks now read the items' `top` coordinates and their
`scrollWidth` against `clientWidth`.

Reusing a CSS variable because its *values* happen to fit is how this
happened. The variable's name says what it is for.

## `ChannelSetup` moved out of the page file

A component defined inside a page cannot be imported by another page, and
duplicating a credential form is how two copies drift into disagreeing about
what a provider needs. It lives in `channels/setup.tsx` now, used by both the
catalogue and the per-channel pages.

## Verified

15 browser checks: the rail lists all nine and they stack one per row with
nothing clipped, a sub-item opens its own page titled with that channel and
showing only its own credentials, the rail marks which is open, switching is
one click from another channel page, the catalogue opens no forms in place and
stays under 1,500px, an unknown channel key is a **404** rather than a blank
page, the sub-nav disappears when the rail folds, and nothing overflows at
390px.

13 new strings in all six languages (455 keys each). Seven of the nine channel
names are **proper nouns** and are identical in every language, per the fleet
rule that already governs Fayda and Telegram.
