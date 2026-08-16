# ADR 0019 — One context panel, not a rail per page

- **Status:** Accepted. Supersedes the `Split` mechanism in ADR 0018; the
  *rule* in 0018 (width is earned, not filled) still stands.
- **Date:** 2026-08-16
- **Decision by:** the founder — *"Zendesk does not stretch end to end. They
  used it for an additional right-hand sidebar which can be opened as a
  slide-out modal."*

## What ADR 0018 got right, and what it got wrong

Right: a page's leftover width should carry something useful, not stretch.

Wrong: it built that as a **per-page rail, always on, always pushing**. Which
meant the product had two different right-panel behaviours — the ticket screen
had one, the customer record another — and neither could be dismissed.

## The three properties, each from a real failure

1. **Docked when there is room, slide-over when there is not.** The ticket
   screen used to **drop** its customer column outright below `roomy`, so on a
   laptop that information did not move — it *vanished*, with no way to ask
   for it. Overlaying is how a narrow window keeps content reachable rather
   than losing it.
2. **The agent can close it, and it stays closed** (localStorage). Somebody
   who shut it meant it; reopening on every navigation is the product arguing
   with them.
3. **Nothing lives ONLY behind it.** If the single way to do something sat
   behind a toggle an agent has turned off, the feature is gone for them. The
   customer's phone number is on the record itself; the panel's `tel:` link is
   a convenience on top. The drive asserts this with the panel shut.

## The shell owns the toggle

It sits beside the alert bell, the same place on every screen. A control that
moves per page is a control an agent has to look for. A page with nothing
contextual to say supplies no panel and **no toggle appears** — rather than a
button that opens an empty box.

## What it carries

| Screen | Panel |
|---|---|
| Ticket | The customer, their history, "name this customer" |
| Customer record | How to reach them — channels actually used, `tel:`, `mailto:` |
| Log a ticket | What they contacted you about before |

## A testing note worth keeping

The first run reported five failures that were all one bug **in the check**:
it found the panel by matching text against `/Customer/`, which matched the
**nav sidebar** — that lists "Customers". Every assertion about opening and
closing was measuring the nav, which is always visible.

`data-context-panel` exists for that: a selector that cannot accidentally
match something else. Selecting UI by its prose is selecting by a coincidence.

## Verified

10 browser checks against the production standalone build at 1600px, 1000px
and 390px: the toggle is in one place, a page without context has none, wide
docks, laptop slides over on request, the backdrop dismisses, closing survives
navigation and reload, the phone number is still readable with the panel shut,
the toggle reopens it, and nothing overflows at any width.
