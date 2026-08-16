# ADR 0023 — Colour-coded tickets, folding rails, an aligned dashboard

- **Status:** Accepted
- **Date:** 2026-08-16
- **Context:** Founder, in one message: tickets should be colour-coded by
  priority and SLA "like Zendesk" rather than everything being one accent; the
  sidebars are always visible and make the console feel crowded; and the
  dashboard's cards and sections should line up.

## Priority and SLA are two axes, and one of them wins

**Priority is an opinion. The SLA clock is a fact.** They disagree constantly:
a LOW-priority ticket whose first-reply promise ran out an hour ago is the most
urgent thing on the screen, and an URGENT ticket answered two minutes ago needs
nothing.

A row has **one** left rail, so the two have to resolve to one answer:
whichever is more alarming wins, and **a breach outranks any priority**.
Showing amber "HIGH" on a row whose clock ran out red buries the thing that
actually needs doing.

That rule lives in `packages/tickets/src/urgency.ts` with 17 tests, not inline
in a screen — it is exactly the sort of thing a supervisor will argue with, and
an argument is better settled by a test than by reading JSX.

## NORMAL is deliberately colourless

Most tickets are normal. **A colour on every row is a colour on none.** The
rail exists to make the few that are not normal findable at a glance, which
only works if the majority stay quiet. LOW is quieter still — it is
information, not an alarm. An unrecognised priority from some future migration
is quiet too, rather than painting the list red.

## The bug underneath: a breach and a warning were the same amber

`Badge` had `success | info | warn | muted` and no `danger`, so `slaState`
returned `"warn"` for an overdue ticket. "We still have twenty minutes" and "we
broke the promise an hour ago" rendered identically — **the one distinction an
SLA display exists to make.** A breach is now `danger`, and `Badge` has the
tone to draw it.

At-risk also earns its own colour rather than sharing with on-track: on-track
promises now render nothing at all, for the same reason NORMAL has no rail.

## An inset shadow, not a border

The rail is `box-shadow: inset 3px 0 0`. A border would widen the cell and
shift every coloured row a few pixels out of line with the plain ones — the
exact ragged edge the third part of this work is meant to remove.

## Both rails fold

Nine destinations and a views list were on screen at all times: 440px of
navigation permanently competing with the ticket somebody is reading. Folding
both reclaims **384px** — measured, not estimated.

They fold differently, on purpose:

- **The app rail collapses to 56px of icons, not to nothing.** A rail that
  vanishes takes "where am I" with it and the way back becomes a hunt — the
  same argument that made the phone's bottom bar slide rather than disappear
  (ADR 0020). Every destination stays clickable, with its label as the tooltip
  and accessible name.
- **The views rail folds to zero.** Its items are saved searches with counts,
  and a count with no name attached is not information. Its reopen control
  therefore lives on the **content** side — a control inside a zero-width rail
  is invisible exactly when it is needed.

Each remembers separately: collapsing the app rail says nothing about whether
somebody wants their saved views.

## The geometry is CSS, and that is not a detail

The first build kept the widths in React state read from localStorage in an
effect — **after first paint**. Someone who folded the rail watched it swing
open and shut on every navigation, shifting the whole page 154px sideways each
time.

Same problem as the theme flash (ADR 0022) and the same fix: the boot script
stamps `data-rail` / `data-views` on `<html>` before anything is drawn, and
`railCss` turns those into `--rail-w`, `--rail-label`, `--rail-justify`. React
state survives only to label the toggle.

The labels and the chevron are **rendered always and hidden by the same
variable**. Conditional rendering on React state would paint full-width labels
inside a 56px rail for one frame.

**A check that reads the width after the page settles cannot see this at all**
— 56px looks identical whether or not it got there via 210. The drive reads it
at DOMContentLoaded instead, the same technique the theme work needed.

## The dashboard

Three things, all of them the same kind of mistake:

1. **Wrapping flex, not a grid.** With `flex: 1` and wrap, the last row
   stretches its survivors — three tiles on one line and one on the next gives
   a lone tile four times the size of its neighbours. `auto-fit` + `minmax`
   reflows evenly at every width.
2. **`alignItems: flex-start`** let the two lower panels find their own
   heights, so their bottom edges never lined up and the pair read as two loose
   cards rather than a row. Stretched, they end level.
3. **No floor on the height.** While the data is loading, both panels collapse
   to a title strip with nothing under it — which reads as a broken page rather
   than one still fetching, and it is the first thing anybody sees. An empty
   card is now centred in a card-shaped space.

## Verified

25 browser checks against the production standalone build, in **both** themes.
The ones worth naming: the tone attribute a row declares is matched against the
`box-shadow` it actually paints — an attribute is a claim, the rail is what an
agent sees — and the rails are confirmed to paint in the light palette too,
not only the dark one they were designed against.

4 new strings in all six languages.
