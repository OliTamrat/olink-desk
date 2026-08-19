# 0043 — The needs-attention queue: ranked, honest about totals, one judgement

**Status:** accepted · 2026-08-19

## Context

ADR 0042 named this as the highest-value next piece of the dashboard, and the
founder said build it. The rail's first block is now a ranked answer to "what
should a person deal with first, right now": tickets past their reply
deadline, tickets about to be, and tickets nobody has taken.

## Decisions

**What deserves attention is decided in exactly one place.**
`escalationsFor` in `packages/sla` already owns that judgement for the alarm
cron — a breach outranks a warning, an SLA problem outranks an ownership
problem, thirty unowned minutes is somebody's problem. The new
`attentionQueue` builds on it rather than restating it, because two files
each deciding "what is urgent" is how the dashboard and the alarms drift into
disagreeing about the same ticket. The queue adds only what a display needs
and an alarm does not: an order, a magnitude, and totals.

**The ranking is the triage order a person would actually use.** Bands:
breached, then at-risk, then unassigned. Within breached, longest-overdue
first — it has been failing the longest. Within at-risk, soonest-due first —
it is the one still savable. Within unassigned, longest-waiting first. Ties
break on ticket id so equal rows do not reshuffle between polls; a queue that
rearranges itself every thirty seconds reads as activity where there is none.

**A dedicated endpoint over the whole open set, not client maths over the
list.** `/api/tickets` is a 100-row recency-ordered page, and the oldest
breach is precisely the row a recency page drops — a queue computed from it
would go quiet about the exact failure it exists to surface.
`GET /api/tickets/attention` queries the open set (bounded by definition),
ranks server-side, and returns six rows plus full totals.

**Totals are computed over everything, never over the truncated rows.** The
header can honestly say "12" while showing six. A count derived from the
visible rows would silently read as "covered everything" — the no-silent-caps
rule.

**Open to every role, agents included.** The wallboard stays
supervisor-gated because it is about the *team*; this queue is about the
*tickets*, and the person who acts on a breach is an agent.

**The magnitude is phrased per kind**, because the same minutes number means
three different things: overdue *by* (breached), first reply due *in*
(at-risk), waiting *for* (unassigned). All but one string already existed;
`ui_attention_title` and `ui_attention_waiting` ship in all six languages.

**The section rule is the one place colour summarises**: grey when clear,
amber when something is at risk, red the moment a promise is broken — so the
state is readable from across a desk before a single row is.

**The block renders only after the endpoint answers.** A "Needs attention: 0"
flashing before data arrives is an all-clear nobody issued.

## Verification

Eight unit tests on the ranking (`packages/sla/test/attention.test.ts`),
including the band order, the per-band directions, stable ties, truncation
never touching totals, and a breached-and-unowned ticket counting once as a
breach — the same rule the alarms apply. Driven in the browser against a
seeded workspace with a 3-hour breach, a 26-minute breach, an 11-minutes-left
at-risk and three unowned tickets: the rail rendered them in exactly that
order at 1440/1920/2560, both themes, no overflow.
