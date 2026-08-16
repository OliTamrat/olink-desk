# ADR 0020 — Four tabs and a More, and a macro preview that tells the truth

- **Status:** Accepted
- **Date:** 2026-08-16
- **Context:** Founder, from a phone screenshot and a Zendesk comparison: the
  bottom bar has too much on it (cap it at five with a More), it should slide
  away as the page scrolls, and Zendesk's macro builder puts a **preview
  beside the editor**.

## The bar had nine items at `flex: 1`

On a 390px phone that is 43px each: labels clipped, the row overflowing
sideways. Four fit legibly, and the rest are one tap away rather than
illegibly present.

**Which four is a judgement about a phone, not a shrunken desktop.** An agent
holding a phone is working the **Inbox** — so it leads, even though the
desktop nav starts with Dashboard. Customers and Knowledge are the two things
consulted mid-ticket. Channels, Macros, Reports, Wallboard and Settings are
desk-bound configuration and supervision; they live in **More**, a sheet from
the bottom where the thumb already is.

More is **bold when the page you are on lives inside it**, so "where am I" is
answerable without opening it.

## Hiding on scroll, and the bug underneath it

The bar costs ~60px of a ~700px screen, permanently, for navigation used
*between* tasks rather than during one. It now slides away on a downward
scroll and returns on an upward one — the gesture for "I want to go
somewhere" is the same one that brings it back, so it is never more than a
flick away. It is always shown near the top, so a page that barely scrolls
cannot strand it.

Building it surfaced a real layout bug: the mobile wrapper carried
`overflow-x: hidden`. **Per spec, an element with overflow other than
`visible` on one axis computes the other to `auto`** — so that div was a
vertical scroll container, the page scrolled *inside* it rather than on the
window, and anything listening for window scroll heard nothing. `overflow-x:
clip` clips without establishing a scroll container.

## The macro preview: a template on the left, a message on the right

An author writes a **template**; a person reads a **message**. Those are
different texts, and until the second one was visible the only way to find out
that a placeholder read oddly mid-sentence — or was misspelled — was to send
it to a real customer.

Rendered through `renderMacro`, the **same function a real send uses**. A
preview-only implementation would drift from it, and a preview that lies is
worse than none.

**And it made a silent behaviour visible.** `renderMacro` strips tokens it
does not recognise — safer than leaking `{{custmer.name}}` to a customer, but
**silent**, so the author saw a sentence with a hole in it and no reason why.
The preview now names them. Stripping stays: the fix is telling the author,
not sending template syntax to customers.

## Two false-passing checks, both mine

Worth recording because they are the same shape as the `/Customer/` selector
bug in ADR 0019 — *the check measured something adjacent to the thing*:

1. **Scroll.** The check used `window.scrollTo(0, 400)` on a page whose
   maximum scroll is 83px. It clamped; a second `scrollTo(0, 120)` clamped to
   the same place, **fired no scroll event at all**, and the check then
   reported a bar that never had a chance to move. Wheel events scroll the
   way a person does, which is also the only way to test what a person
   experiences.
2. **The misspelled placeholder.** The check matched `/\{\{custmer\.name\}\}/`
   against the whole page — and matched the **textarea it had just filled**.
   It passed green while the preview silently deleted the token and said
   nothing. A check that reads back the input it typed is checking its own
   typing.

Both now read the specific element.

## Verified

16 browser checks against the production standalone build at 390px and
1500px: five items and no clipped label, nothing in More became unreachable, a
More destination navigates and closes the sheet, the bar hides going down and
returns going up and is always shown at the top, the preview resolves
placeholders and says its values are examples, a misspelled placeholder is
named *and* its consequence shown, and the preview stacks below the editor on
a narrow window.
