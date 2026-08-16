# ADR 0012 — Reports refuse to say more than they know

- **Status:** Accepted
- **Date:** 2026-08-16
- **Context:** The wallboard answers "right now". Nothing answered "how did we
  do, and is it better or worse than last time" — the question a manager asks
  and the one that ends up in a board pack.

## Why now

Reporting was deliberately sequenced **after** CSAT (ADR 0009) and tags
(ADR 0011), because without them the report has no quality dimension and no
answer to "what are people contacting us about". Built earlier it would have
been a page of volume counts pretending to be insight.

## The governing rule

A report is the one screen in a support product that gets printed, quoted,
and argued over months later. Every rule here exists to stop it saying
something it cannot support.

**1. A rate with no denominator is `null`, never `0`.** "0% of first replies
were on time" on a desk that has answered nothing is a lie told by a
division, and it is the first thing a prospect sees on a fresh workspace.
Ported from Bank Assist's analytics rule.

**2. Every number carries the count it rests on.** A median over 2 tickets and
over 200 are different facts wearing the same number, so the denominator is
rendered under the figure and is not optional.

**3. No trend is claimed off a base too small to support one.** Two tickets
last week and three this week is "+50%" and means nothing — but printed next
to an arrow it is read as a trend and repeated in a meeting. Below
`MIN_BASE_FOR_DELTA` (10) observations on **either** side, `delta()` returns
null *with a reason*, and the screen says "Too few to compare" in words. A
silent dash would read as "no change", which is itself a claim.

Dividing by a previous value of zero is refused for the same reason: any
increase from zero is infinite, and both printing `Infinity` and quietly
substituting 100% are inventions.

**4. Median, not mean.** One ticket answered three weeks late drags a mean
until the number stops describing the desk. A supervisor asking "how long do
people usually wait" is asking for the middle.

**5. The on-time rate counts only tickets that were answered.** A ticket still
waiting is in neither half — counting it as a miss reports a failure that has
not happened yet.

## The report nobody else in this market produces

**Languages they wrote in.** Every competitor can tell an Ethiopian
organisation which channel its customers use. None can tell it what share
wrote in Amharic rather than English — and for a desk deciding who to hire
next, that is the most actionable line on the page. It is the multilingual
moat showing up as a *number* rather than as a feature.

Language names render in their own script: a manager recognises ትግርኛ far
faster than `ti`.

## Drill-down

Per ADR 0010, every metric card and every bar links to the tickets behind it,
including each topic (by tag slug, ADR 0011). A report that cannot be opened
is a report nobody trusts.

## One definition of median

The wallboard had its own inline copy. It now imports the same one, so the
two screens cannot drift — the same reasoning that moved `slaState` into
`packages/sla` in ADR 0008.

## Two bugs, and what caught each

**Today's tickets fell off the chart.** The window started at `now − 30 days`
at the current time of day, so the thirty buckets ended *yesterday*. Caught
by summing the series and comparing it to the real ticket count — an
assertion about internal consistency, which is the only kind that finds an
off-by-one nobody can see. The window now aligns to the start of a local day,
inclusive of today, and `bucketByDay` has a test pinning that contract.

**The satisfaction card said "Satisfaction today" on a 30-day report.** I
reused the wallboard's key. Caught in a screenshot, not by any assertion —
the third time this session that a label was wrong in a way only rendering
could reveal.

## Verified

20 unit tests on the arithmetic and 16 browser checks against the production
standalone build, including that a fresh workspace reports null rather than
0%, that no trend is claimed off four observations, that the on-time rate
rests on 4 answered rather than 7 total, that the volume series sums to the
real count, that an agent cannot read the reports at all, and that a topic
drills to exactly its four tickets.

## Not in this slice

- **CSV export.** Client-side, from numbers already on the page (the Bank
  Assist precedent) — small, but a separate change.
- **Per-agent breakdown.** Deliberately deferred: a per-person productivity
  table is a management decision about how a desk is run, not a reporting
  detail, and it should be discussed before it is built.
