# ADR 0011 — Tags are normalised, because the point of them is to be counted

- **Status:** Accepted
- **Date:** 2026-08-16
- **Context:** Nothing in the product could answer "what are people
  contacting us about". Channel says where a ticket came from, queue says who
  handles it, and neither says what it is *about*.

## Decision

A tag carries two fields: **`name`**, what a person typed, and **`slug`**, the
normalised form that carries the uniqueness constraint.

That split is the whole feature. Without it a desk accumulates "Refund",
"refund", "refund " and "Failed payment" / "failed_payment" /
"failed-payment" as separate tags, and every report built on them is
**quietly wrong** — which is the worst kind, because nothing looks broken.

`tagSlug()` case-folds, trims, collapses inner whitespace, and unifies spaces
and underscores to hyphens. It lives in `packages/database` beside the schema
rather than in a route, because the slug is a property of the data model:
three callers computing it slightly differently would *defeat* the constraint
rather than enforce it.

Two deliberate non-decisions:

- **No stemming.** "refund" and "refunds" stay distinct. Stemming would
  silently merge labels a person chose on purpose, and unlike a spelling
  variant there is no way for them to notice it happened.
- **Letters in any script survive.** A rule that stripped non-ASCII would
  make every Amharic tag normalise to the same empty slug. `\p{L}` rather
  than `[a-z]`, and a test asserts ክፍያ survives intact.

A name made entirely of punctuation is refused rather than stored, because it
normalises to the empty slug and would collide with every other such name.

## Who may tag

**Every agent.** A support desk labels new kinds of problem as they appear,
and routing that through an admin means the labelling simply does not happen
— which costs far more than a few stray tags. The slug normalisation is what
makes that affordable.

Tagging takes a **name**, not an id, and finds-or-creates. Typing "Refund"
when "refund" exists returns the existing tag rather than a conflict the
agent cannot act on. Tagging the same ticket twice is a no-op: from the
agent's side the ticket is tagged either way, and an error would be noise.

## Drill-down

Every tag on a ticket is a **link** to the tickets sharing it (ADR 0010's
rule applied to the one field whose entire purpose is grouping). *A tag you
cannot click is a label; a tag you can click is a report.*

The filter matches on **slug, not id**, so a drill-down URL is readable and
survives a tag being renamed — the slug is what identity means for a tag.

## Two bugs, and what caught each

**The rail showed "No tags yet" on a tagged ticket.** Tags were added to the
list route's select and the *detail* route is a different file. Two routes
feeding one screen is exactly where a field goes missing, and only rendering
the screen finds it.

**Clicking a tag did nothing** — and this one is the more interesting. Next
reuses a mounted page across a client-side navigation to the same route, so
reading the search params once as *initial state* meant an in-app drill-down
never applied: clicking a tag while a ticket was open left the ticket open
and the filter unset. Every URL-driven filter added in ADR 0010 had this
defect; it only surfaced now because tags are the first drill-down whose
source is *inside* the inbox rather than another page.

The fix syncs state from the URL whenever it **changes**, not only on mount.
It stays one-way — nothing pushes state back into the address bar — so the
filter controls still never fight it, which was the reason for the
initial-only version in the first place. A drill-down to a list also closes
whatever ticket was open, or the agent lands on the ticket they were already
reading and concludes the link is broken.

## Verified

19 unit tests on normalisation (including the Ge'ez and no-stemming cases)
and 13 browser checks against the production standalone build, including that
six spellings collapse to two tags with correct counts, that a foreign
workspace can neither see nor attach these tags, and that clicking a tag on
an open ticket lands on exactly its list. The ADR 0010 navigation suite was
re-run afterwards and still passes — the URL-sync change touched every filter
it covers.

## Next

The tag counts are the input to reporting, which is the following slice:
"what are people contacting us about, and is it getting better or worse".
