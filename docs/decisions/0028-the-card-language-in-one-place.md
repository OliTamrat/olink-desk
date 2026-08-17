# ADR 0028 — The card language in one place, and geometry as a checkable thing

- **Status:** Accepted
- **Date:** 2026-08-17
- **Context:** Founder, with screenshots of the Wallboard and the Macros page:
  "This design and content structure is so dull and ugly? When you done with
  the redesign I guess this is where we need to fucus."

## He was right, and the reasons are nameable

Not a taste disagreement. Four specific defects, in two screens:

1. **A row of macro cards at three different heights**, with Edit landing on
   three different lines. Title, metadata and buttons were laid out as ONE
   wrapping flex row, so a longer title wrapped the buttons under it on one
   card and not on its neighbour. A grid that does not line up reads as three
   designs rather than one.
2. **An empty state hugging the top-left of a 300px box.** That is the shape
   of a panel that failed to load. It was not a data problem — the text said
   the right thing.
3. **Three stacked em-dashes** where today's medians go. Same failure: a quiet
   desk and a broken panel rendered identically.
4. **A page that was three cards and six hundred pixels of nothing.** The
   Macros page had no search, no filter and no count — nothing but the grid.

## What actually caused the first three

The wallboard had `gridTemplateRows: "auto auto 1fr"` and a `minHeight` of
almost the viewport, added so a wallboard would fill the television it is put
on. On a busy desk that is fine. On a quiet one it **inflated a one-line panel
into a void** — the screen looked emptier than leaving it short ever would
have.

The rule that replaces it: **a wallboard earns its size with type scale and
spacing, not by pulling empty boxes taller.** Sections size to their content.

## `card.tsx` — the language, not a component library

`IconTile` already existed inside `status-overview.tsx`, used by exactly one
screen, while every other surface invented its own card. That is how a console
ends up looking like several products stapled together.

Promoted to `apps/web/src/lib/card.tsx`: `IconTile`, `CardHead` (icon, title,
and the sentence saying what the card is FOR), `EmptyState`, `Figure`, and the
two style objects — `cardColumn` + `cardFooter` — that make a grid line up.

**`cardFooter` is the load-bearing one.** `marginTop: auto` inside a
full-height column puts every card's actions on the same line regardless of
what is above them, and the grid moved from `alignItems: start` to `stretch`.
That is the whole fix for defect 1, and it is two properties.

**`Figure` owns the null case** so no screen has to remember it. `value ===
null` renders words, not an em-dash. `EmptyState` owns the padding so no
screen can ship a one-line empty state again.

## The checks were measuring something adjacent — again

The previous pass on these two pages passed **15 browser checks** and still
looked wrong in a screenshot, because every check asked whether the WORDS were
right. The words were right. The defects were **geometric**.

So this round's checks read positions and sizes:

- every card in a row has the same height, and their Edit buttons share one Y;
- the empty state's slack above equals its slack below (within 2px) and its
  card is under 220px;
- the queue panel has under 60px of slack beyond its table;
- no element's text is a bare `—`.

The two-line-title case is now a **fixture**, not a hope: the drive creates a
macro with a deliberately long title and asserts it still lines up.

That is the fifth time this session that a check measured something next to
the thing. Recording the general form: **when a check and a screenshot
disagree, the check is measuring the wrong property** — go find which one.

## Search on Macros is a feature, not filler

A desk with sixty macros cannot use a page that is only a grid of them. Search
covers **titles, categories and bodies** — an agent looking for "the one that
mentions the refund window" is searching the text, and a title-only search
would report nothing while the macro sat two cards away. Category pills are
derived from the data, so a workspace that never categorised anything sees no
pills rather than an empty control.

Filtering is client-side on purpose: a workspace has tens of these, not
thousands, and a round trip per keystroke would make the control feel worse
than no control.

The summary line carries **two** numbers, and the second is the one being
managed: how many of these a customer can actually receive in their own
language.

## Small things that get screenshotted

- `1 macros` is what a filter matching once produced. Every language now
  carries its own singular rather than interpolating into a translated plural.
- The medians card was titled **New today**, colliding with the TILE of the
  same name that counts tickets — two different facts under one label. It is
  `Today` now, with "since midnight" in the blurb, because a supervisor
  reading it at 1am needs to know which day is meant.
- Delete moved to the far end of the footer with `marginInlineStart: auto`. It
  was already borderless and muted; sitting shoulder to shoulder with Retire
  still made it a near miss.

## Verified

37 browser checks against the production standalone build, in dark and light,
at 1500px and 390px. 10 packages of unit tests, typecheck clean.

11 new strings in all six languages (410 keys each), review sheets
regenerated.
