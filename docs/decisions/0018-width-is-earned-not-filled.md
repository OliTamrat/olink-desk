# ADR 0018 — Width is earned, not filled

- **Status:** Accepted
- **Date:** 2026-08-16
- **Context:** The founder circled the empty right half of the customer record
  and the log-a-ticket form and asked what the plan for it was, across all
  pages.

## What was actually wrong

Every screen capped itself — `maxWidth` of 560 to 1100 — **and pinned that cap
to the left.** On a 1600px monitor that left a band of dead space down the
right of every page in the product.

The cap itself was not the mistake. Long text lines genuinely hurt: past
roughly 90 characters the eye loses the next line. The mistake was applying a
cap that belongs to **a column of text** to **a whole page**, and then
anchoring it left, so the result read as a rendering bug rather than a choice.

## The rule

**The reading column stays capped. The width left over either earns its keep
with a second column of something an agent actually needs, or the content is
centred.**

Filling space with decoration is worse than leaving it empty — it costs the
reader attention and returns nothing. That is not a slogan: the first attempt
at this change stretched the customer record's stats card to 1400px, and two
numbers floating in a 1300px box is a worse use of the space than the void
was.

The cap and the centring now live **in the shell, once**, so a page added
later gets them without remembering to. The wallboard opts out with
`fullBleed` — it is read across a room from a television, and capping it at
1440 would waste exactly the space it exists to fill.

## Per page

| Page | Answer |
|---|---|
| Customer record | **Rail**: can the desk actually reach this person? |
| Log a ticket | **Rail**: what they contacted you about before |
| Knowledge, Macros | **Card grid**, 2–3 across — width used by content |
| Customers, Reports, Dashboard | Full width, centred; they are tables and charts |
| Settings, Channels | **Centred.** Nothing honest goes beside a settings form |
| Wallboard | Full bleed |

## The rails are not filler, and that is the test of them

Both answer a question the main content does not.

**"How to reach them"** shows the channels this customer has actually written
in on — which is *not* the same as which contact details are on file. A
customer who exists only because staff logged calls has a phone number and no
way to be messaged, and an agent needs to know that before promising a reply.
The `tel:` and `mailto:` links are the operator's own phone and mail client on
purpose: a message sent from there is **not** on the ticket, which is exactly
why they sit under "how to reach them" rather than beside the reply box.

**The log-a-ticket rail** shows what this customer contacted us about before,
as soon as they are picked — because an agent typing up a call wants to see
"they rang twice last week" *while typing*, not after the ticket exists.

Both stack **below** the main content on a phone: on a small screen, what was
asked for comes first.

## What caught what

The measured check for dead space passed happily on a card stretched to
1400px, because a stretched card leaves no dead space. A second check —
**no card of prose or fields wider than 1180px** — is what caught it, and then
caught two more pages (knowledge and macros stacking single-column cards at
1334px, and their empty-state cards doing the same).

Worth recording as a pattern: *a check written for one failure mode will pass
the opposite failure mode.* "Not empty" and "not stretched" are two
assertions, and only having the first is how the first attempt looked correct.

## Verified

12 browser checks against the production standalone build at 1600px, 1000px
and 390px: no page leaves a band of dead space, no card is stretched, the rail
names the channel a reachable customer has used, an unreachable customer is
named as unreachable rather than left ambiguous, the log-a-ticket rail fills
when a customer is picked, single-column pages are centred rather than pinned,
the wallboard still fills the display, nothing overflows narrow, and the rail
stacks below the main content on a phone.
