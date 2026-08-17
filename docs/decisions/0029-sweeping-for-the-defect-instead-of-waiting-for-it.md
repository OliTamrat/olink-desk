# ADR 0029 — Sweeping for the defect instead of waiting to be shown it

- **Status:** Accepted
- **Date:** 2026-08-17
- **Context:** ADR 0028 fixed the Wallboard and the Macros page after the
  founder screenshotted them. The obvious next question is which OTHER pages
  have the same defect and simply have not been looked at yet.

## The sweep

`sweep.mjs` drives all nine console pages and measures the four things ADR
0028 found, as **geometry** rather than as text:

1. cards sharing a row at materially different heights;
2. a fact rendered as a bare `—`;
3. a short piece of text alone at the top of a tall box (the shape of a panel
   that failed to load);
4. a card whose content ends more than 80px above its own floor.

It **reports rather than asserts** — the output is a work list, not a gate. A
threshold tuned to be a CI check would have to be loose enough to never fire
on a legitimate layout, and that is precisely the looseness that let these
through.

Result: `/inbox`, `/customers`, `/channels`, `/macros`, `/knowledge` and
`/settings` clean. `/dashboard` flagged a false positive (a wrapper element,
confirmed by eye). Two real finds.

## Find 1 — Reports had the identical defect, unscreenshotted

Four of five metric tiles rendered `—` on any workspace whose window produced
no medians. Same failure as the wallboard: **a quiet week and a broken report
looked exactly alike**, on the page that gets quoted in a board pack.

Fixed the same way — `duration()` now returns `""` rather than `"—"`, and the
tile decides. The rule generalises and is worth stating: **a formatter must
not invent an em-dash.** It does not know whether it is standing in for
"nothing happened" or "this failed", and only the caller does.

Also on that page:

- **The volume chart had no axis at all.** Thirty slots, one bar at the far
  right, no y-max, no dates, no baseline — the bar heights had nothing to be
  read against, so they were decoration. It now carries a y-max label, a
  baseline, both ends of the window as dates, and **the reading in a
  sentence** ("Busiest day: 5 on Aug 17"). A single bar in a ninety-slot chart
  carries shape but no number; the sentence carries the number.
- **A window with nothing in it drew a row of 1px hairlines.** That is not a
  chart, it is a chart that looks broken. It gets the empty state instead,
  with the two ways forward: widen the range, or connect a channel.
- The three breakdown cards were `alignItems: flex-start` and came out ragged.

## Find 2 — a fix that created its own defect

Stretching the wallboard's bottom row to equal heights (ADR 0028) left the
Agents card with **113px of dead space** under a one-name list. The alignment
was right and the consequence was ugly.

The resolution is not to un-stretch it: it is to put something at the bottom
worth having. `Add a teammate →` is pinned there with `cardFooter`, gated to
ADMIN/SUPERVISOR, and it is the action a supervisor reading a one-name list
actually wants.

Worth recording because it is a general shape: **`alignItems: stretch` makes
a sparse card's emptiness visible.** That is the stretch working — the
emptiness was always there — but it means every stretched row needs its
sparsest card to have a footer, or it trades ragged for hollow.

## What this is really about

The founder's screenshot found Wallboard and Macros. A different screenshot
would have found Reports. Waiting for the screenshot means the defect ships
to every page nobody happens to open — which, for a console with nine of
them, is most of the product.

Six new strings in all six languages (415 keys each). 16 browser checks on
Reports, driving the EMPTY case first because that is the one that was wrong.
