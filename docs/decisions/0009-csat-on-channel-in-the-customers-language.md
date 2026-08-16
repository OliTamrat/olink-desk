# ADR 0009 — CSAT: on the channel, in the customer's language, and never swallowing a question

- **Status:** Accepted
- **Date:** 2026-08-16
- **Context:** Second slice under full product ownership. `csatScore` and
  `csatComment` had been in the schema since v1 and were **entirely unused** —
  the product could receive and answer, but had no way to say whether it was
  any good.

## Why this next

Escalation (ADR 0008) made the desk tell somebody when it was late. This
makes it able to say whether the work was worth anything. Together they are
the measurement story: without them the console reports activity and calls it
performance.

## Decision

**The survey goes out on the channel the ticket arrived on, in the
conversation's own language.** Not email, not a link to a web form — the
customer is already in a Telegram thread or a widget, and moving them to
another surface to answer one question is how response rates die. The
language comes from the conversation's sticky language, exactly like a macro
(ADR 0007), so an English-speaking agent resolving an Amharic ticket sends an
Amharic survey without doing anything.

## The hard part: is "5" a rating or a message?

After a survey goes out, the next thing the customer sends is either a score
or a brand new problem, and **nothing about the transport tells them apart.**
Both arrive as a line of text on the same conversation.

The rule is deliberately narrow: **a rating is a message that is essentially
just a number.** Anything with words in it is a message.

The asymmetry is the decision. *Losing a rating costs a data point; losing a
question costs a customer.* So the parser errs hard toward "this is a
message":

- `"4"`, `"4."`, `"4/5"`, `"★★★★"`, `"፬"` → a rating.
- `"45"`, `"4521"`, `"0911234567"` → **not** a rating. An order number or a
  phone number is exactly what a customer sends right after being asked
  something, and reading `"45"` as 4 would swallow it.
- `"4 but the app is still broken"`, `"my order 3 never arrived"`,
  `"ሰላም 3 ቀን ሆኖታል አልደረሰም"` → **not** a rating. These are the cases the
  tests exist for.

Two more gates before the parser is even consulted:

- **A survey must be open on this conversation.** `csatSentAt` set,
  `csatScore` still null, within 48 hours. Without the score check, a customer
  who already rated could have a later `"2"` — plainly a new message —
  swallowed as a second score. Without the window, a number sent weeks later
  is captured instead of answered.
- **Ge'ez numerals are accepted** (፩–፭). Rare in chat, but a customer who
  sends ፫ has unambiguously sent a three, and refusing it is a gap nobody
  would ever think to report.

## Who gets asked

**A ticket no person ever replied to is never surveyed.** Asking "how did we
do?" about an exchange the desk never took part in reads as mockery, and the
answer would measure nothing. This is the rule an implementation gets wrong
by treating "resolved" as the only condition, and it is the first thing the
drive script checks.

A ticket already surveyed is never surveyed again, so re-resolving a reopened
ticket does not re-ask.

## Failure is swallowed, deliberately

Resolving is the agent's action and must succeed even if the customer's
channel is down. A survey that could not be sent leaves `csatSentAt` null —
which is exactly how an unsent survey stays findable later. Same reasoning as
Bank Assist's rule that an email failure must never fail the webhook.

`csatSentAt` is stamped **after** delivery, not before, so a failed send can
be retried and an unanswerable survey is never treated as outstanding.

## Reporting it honestly

The wallboard shows the average **with its denominator**: "4.0 from 3
replies". `4.0` from one reply and `4.0` from ninety are different facts, and
a figure with no denominator is the easiest number in this product to be
misled by (Bank Assist's rule that a rate with no denominator is null, never
zero).

The ticket rail shows **three distinct states, never collapsed**: a score, a
survey still unanswered, and no survey at all. Showing "Not rated" for a
ticket nobody was asked about would read as a customer who declined.

## One transport, not two

`sendAgentReply`'s channel switch was extracted into `deliverOnChannel` so the
survey travels the same road. A second copy would be a second place for a
channel to be forgotten — and the one that was forgotten would be the quiet
one.

## The bug the drive caught

The first version **sent the thank-you without recording it**. On WEB,
recording *is* delivery — the widget reads message rows — so the customer saw
nothing at all. Twelve checks passed and that one failed, which is the whole
argument for asserting on what the customer receives rather than on what the
code called.

Both halves of the exchange are now recorded on the surveyed ticket: the
customer really did send something and we really did answer, and a timeline
showing a thank-you with nothing before it would be a lie of omission. What
is still *not* created is a new ticket — which was the actual point.

## Verified

16 unit tests on the parser (including every "never swallow a question" case
in five languages) and 13 browser checks against the production standalone
build, including that an Amharic customer receives Amharic on both the survey
and the acknowledgement.

## Not in this slice

- **A comment field.** `csatComment` stays unused; asking a follow-up "why?"
  on a messaging channel needs its own conversational state, and bolting it
  onto the rating parser would put both at risk.
- **Inline buttons.** Telegram could render 1–5 as tappable buttons rather
  than asking for a typed number. Worth doing, but it is per-channel work and
  the typed path has to exist anyway for SMS and USSD.
