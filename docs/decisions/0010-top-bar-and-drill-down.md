# ADR 0010 — A top bar, and every number drills to the list behind it

- **Status:** Accepted
- **Date:** 2026-08-16
- **Decider:** Founder — "the notification bell needs to be moved to the top
  navbar where it can be seen easily… build a very rich and robust navbar and
  sidebars inspired by the global platforms", and "any section or card that has links to
  another part should be built with the drill-down feature".

## The bar

There was no top bar. The console was a single left rail with everything
crammed into its bottom — language, sign out, and the alert bell. That is why
the bell was hard to see, which is the one thing an alert cannot afford.

the standard shape, and the reason for it: **the things an agent reaches for from
any screen belong on a bar that is always in the same place.** So the top bar
now carries, left to right:

- brand + workspace name (the workspace name matters — an agent with two
  Desk tabs open needs to know which one they are typing into);
- **global search**, which navigates to `/inbox?view=all&q=…` — the same URL
  shape a drill-down produces, so there is one filtered-list contract for the
  whole console rather than a separate search results page to maintain;
- the **alert bell**, at 10px from the top of the viewport on both layouts;
- an **account menu** grouping identity, language and sign out. Three loose
  controls on a bar stop it reading as a bar; they are all about the person
  rather than the work, so they group.

The left rail is now navigation and nothing else. The second sidebar layer
(a screen's own views) is unchanged — the three-layer the global platforms shape is intact,
with the bar spanning above all of it.

The bell's panel placement is now decided by the **viewport**, not the call
site: it drops from the button on a wide screen and spans the width on a
phone, where the bell is not the rightmost control.

## Drill-down

**A number on a dashboard is a question — "which two?" — and the only useful
answer is the list itself.** Every count now links to the tickets behind it:

| Surface | Drills to |
|---|---|
| Open now / New today / Awaiting first reply | the matching filtered list |
| Tickets by channel (each bar) | that channel |
| Recent tickets (each row) | **that ticket**, opened |
| Wallboard: open / new / at-risk / breached | the matching list |
| Wallboard queue row: name, open, unassigned, at-risk, breached | five *different* slices |
| Wallboard agent row | that person's open work |
| Alert row | its ticket |

Two rules made this real rather than cosmetic:

1. **A cell drills to its own slice, not its row's.** Linking a whole queue
   row to one filter would make five different numbers open the same list,
   which teaches an agent that the numbers are decoration.
2. **The count and the list must mean the same thing.** Each tile's filter
   exists on the tickets API with the same definition, so a drill-down can
   never disagree with the number that produced it. Where the number was
   derived rather than stored — at-risk and breached — the API filters in
   code against the same `slaState()` the wallboard and the escalation cron
   use, rather than reimplementing "breached" in SQL. One definition, three
   consumers (ADR 0006, ADR 0008).

`queue=none` is a real filter, not the absence of one: the unrouted bucket
would otherwise drill to every ticket in the workspace.

## Filters that arrive only from a link

`queue`, `sla` and `awaiting` have no control in the inbox — a link is the
only way in. They are still cleared by **Clear**, because a Clear button that
leaves an invisible filter applied is worse than no button at all.

## Three bugs, and what caught each

1. **The production build, not typecheck.** `useSearchParams` opts a page out
   of static generation and Next requires the Suspense boundary to be
   explicit. Typecheck was perfectly happy; `next build` failed on
   prerendering `/inbox`. Another case of a green check not being the check
   that matters.

2. **Search landed unfiltered.** I wired every URL filter *except* the search
   term, so the new top-bar search navigated to `?q=…` and the list ignored
   it — returning all three tickets and looking like it had worked. **A
   drill-down that lands unfiltered is worse than no drill-down: it looks
   like an answer.** Caught by counting rows at the destination rather than
   asserting the link existed.

3. **A test that could not fail.** The first Clear check filtered on
   "awaiting first reply" while every ticket was unanswered, so the filter
   matched everything and clearing it could not widen the list — the check
   would have passed on a Clear button that did nothing. Fixed by answering
   one ticket first, so the filter genuinely excludes something.

## Verified

13 browser checks against the production standalone build, at 1500px and
390px: the bell's measured position in the top bar, search landing on one
row of three, "Open now" landing on two of three, a channel bar carrying its
filter, a recent row opening its own ticket, eleven wallboard drill links
covering sla/queue/assignee, the SLA filter genuinely excluding, Clear
widening a link-only filter, and no horizontal overflow on either width.
