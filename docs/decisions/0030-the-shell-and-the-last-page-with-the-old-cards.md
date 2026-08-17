# ADR 0030 — The shell's own layout, and the last page still wearing the old cards

- **Status:** Accepted
- **Date:** 2026-08-17
- **Context:** Founder, after ADRs 0028–0029 shipped: the top bar's controls
  sit in the middle of the bar rather than anchored; collapse belongs at the
  bottom of the rail with the language picker and sign-out; and the knowledge
  base's cards are unattractive — "the cards design should feel [the same] and
  appeal on all pages."

## The gap this exposes

0028 and 0029 built a card language and applied it page by page. That was the
right unit of work for the pages and the wrong unit for the **shell** — the
top bar and the rail are on every screen, so a defect there is the most
visible one in the product and belongs to no page's redesign.

And the sweep in 0029 measured **cards**. It could not see that Knowledge
still had six coloured language pills per card and a red Delete at Edit's
weight, because those are legitimately-shaped cards containing the wrong
things. `/knowledge` came back clean.

That is the same failure recorded three times now: **the check measured
something adjacent to the thing.** Here the adjacency was the *unit* — cards,
not chrome; geometry, not content.

## 1. Nothing in the top bar floats in the middle

The bar laid out brand → search (`flex: 1, maxWidth: 480`) → actions, with
nothing after. On a 1500px window the cluster ended around x=965 and **a third
of the header was empty beside it**, which is what makes a bar read as
unaligned rather than as spacious.

The actions moved into a wrapper with `marginInlineStart: auto`. Search runs
from the left, actions are pinned to the right edge — **every element is
anchored to an edge and none sits in the middle**. Measured: 18px from the
right edge, down from ~535.

## 2. The rail's footer

Collapse was sitting directly under Settings, where it read as a tenth
destination. Language and sign-out were in the header's account menu.

All three now sit in a bordered footer at the bottom of the rail: they are the
things you reach for about the *session* rather than about the *work*. Each
wears the nav item's own geometry — the same padding, justify and
hide-the-label CSS variables — so the footer folds with the rail instead of
becoming three unlabelled glyphs at 56px.

**The language control is a native `<select>` laid invisibly over its row.** A
styled `<select>` cannot hide its own text when the rail folds, and a custom
popover would have been the fourth language control in this shell. This keeps
keyboard and touch behaviour for free.

### The regression that came with it

Pushing the footer down needs `flex: 1` on the nav. The nav is a `grid`, and
**a grid told to fill its parent distributes the spare height into its rows** —
so all nine destinations silently double-spaced, 40px apart to 82px. Every
other check still passed.

`alignContent: "start"` fixes it, and there is now a check on the *spacing
between destinations*, because nothing else in the suite would have noticed.

## 3. Knowledge was the page the card language never reached

It still had, verbatim, the design removed from Macros in 0028: six bordered
language pills per card, a red Delete at Edit's weight, buttons mid-card, and
`alignItems: start` producing four cards at three heights.

Rebuilt to match Macros exactly — icon tile, title, one muted caption line,
the coverage **sentence**, and a pinned footer with Delete demoted and pushed
to the far end. Plus search across titles *and* bodies in every language, a
published/draft filter, and the summary line.

**`coverage()` is shared with Macros rather than reimplemented.** An article
counts as written in a language only when its title *and* body exist there —
a body with no title is unreachable, a title with no body answers nothing — so
the page collapses that into the one-map shape `coverage()` takes. The two
pages cannot now drift on what "written in six languages" means.

## What to take from this

Two rules, both about scope rather than craft:

1. **The shell is not a page.** It needs its own pass whenever a design
   language changes, or it stays on the old one everywhere at once.
2. **A sweep finds what it measures.** 0029's swept for card geometry and
   passed a page whose cards were geometrically fine and full of the wrong
   things. Before trusting a clean sweep, ask what shape of defect it is blind
   to.

## Verified

23 browser checks against the production standalone build: the bar's anchoring
in pixels, the footer's position and its behaviour at 56px, nav spacing, and
Knowledge's card geometry, demoted delete, search, filter and empty states.
Light and dark, 1500px and 390px. 5 new strings in all six languages (420 keys
each).
