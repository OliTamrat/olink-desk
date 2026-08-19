# 0042 — The dashboard earns a wide monitor: two zones, and the auto-track overflow

**Status:** accepted · 2026-08-19

## Context

The founder reported the dashboard "clipped in the middle" on a bigger screen,
and asked for a layout that actually uses both sides of a desktop display —
and for a view on what an industry-standard desk overview looks like.

Driving the real page (local Postgres, a seeded workspace, Chromium at five
widths) reproduced two distinct problems that read as one:

1. **A real horizontal overflow at ordinary desktop widths.** At 1440px the
   document scrolled sideways by exactly 56px and the recent-ticket rows ran
   off the right edge mid-badge. At 1920+ it vanished, which is why it looked
   like a "big screen" problem — it is actually a 1024–1550px problem, and
   most office monitors land there once OS scaling is on.
2. **A wide monitor bought nothing.** Content was capped at 1440 and centred,
   the setup card sprawled full width, the channel card sat two-thirds empty,
   and 2560px of screen showed the same single column as 1366.

## The overflow: a bare implicit grid track

The recent-tickets rows sat in `<div style={{ display: "grid" }}>`. With no
template, the implicit column is `auto` — which sizes to the widest item's
**max-content**, and an auto track is permitted to overflow its own grid
container. A row's max-content includes the full untruncated nowrap subject
line: `minWidth: 0` on the subject span caps *flexing*, not the max-content
contribution. Computed result: a 640px track inside a 533px card, pushing 56px
past the viewport.

**The rule this adds: a grid wrapper around rows that contain nowrap text is
`gridTemplateColumns: "minmax(0, 1fr)"`, never bare `display: grid`.** The
same latent bug was fixed in the status-overview drilldown and guarded in the
overview rows. Plain `1fr` is not enough either — `1fr` means
`minmax(auto, 1fr)`, and the `auto` minimum re-admits the same failure from
the other side.

Two more wrong-looking-right numbers fell out of driving it: the page fetched
`/api/tickets` bare, which defaults to the OPEN view — so "Resolved today"
was permanently 0, the Done drill-down permanently empty, and the channel
bars forgot every ticket the moment it was solved. It fetches `view=all` now,
and the fourth KPI tile (Resolved today) exists because the other three only
ever grow.

## The layout: analysis left, activity right

The industry-standard desk overview (the shape Zendesk, Freshdesk and
Intercom all converge on) is three bands: a KPI strip, an analysis column,
and a live activity rail. That is what the page is now:

- **KPI strip** — four tiles: Open now, New today, Awaiting first reply,
  Resolved today.
- **Left zone (analysis)** — setup checklist, the lifecycle overview with its
  drill-down, tickets by channel. Boxed, shadowed, computed.
- **Right zone (the activity rail, ≥1280px)** — recent tickets as a feed:
  two-line rows (subject full-width, then number · status · age), sitting
  directly on the page background under a headline rule, `position: sticky`
  so it follows the reader down the page. Deliberately NOT another card: two
  zones with the same texture read as one wide mess; the different feel is
  what makes the layout legible.
- **The dashboard opts out of the shell's 1440 cap** (`fullBleed`) and fills
  the display — an overview is the one screen bought FOR a big monitor, and
  the founder's report circled the voids themselves, so a taller cap was not
  an answer. A 2400 limit exists only as an ultrawide fuse. Work screens
  keep 1440. Above 1900px the activity rail widens to 400–520px so its share
  of the extra space is spent on subjects, not margins.

Below 1280 the rail stacks under the analysis column in source order; the
phone layout is unchanged.

## What was deliberately not built (and would come next)

Named here because the founder asked what an "all-inclusive" dashboard needs.
Each is an endpoint question, not a layout question, and belongs to its own
change:

- **A "needs attention" queue** — SLA at-risk/breached and unassigned-oldest,
  ranked. The wallboard computes this today; the dashboard rail is where a
  supervisor would actually act on it.
- **Trend sparklines** on the KPI tiles (today vs the last 14 days). Needs a
  small aggregate endpoint; drawing it from the ticket list would cap at the
  list's page size and lie.
- **Per-agent load** (open per assignee) for supervisors.
- **CSAT tile** once responses accumulate — the number exists in reports.

## Verification

Typecheck across 14 packages; every suite that runs without the CI Postgres
service is green. Driven at 390, 1366, 1440, 1920, 2560 in both themes:
document overflow is zero at every width (it was 56px at 1440 before), and
the two-zone layout was screenshotted, not assumed.
