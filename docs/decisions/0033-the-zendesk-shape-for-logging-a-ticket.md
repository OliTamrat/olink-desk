# ADR 0033 — The Zendesk shape for logging a ticket

- **Status:** Accepted
- **Date:** 2026-08-17
- **Context:** Founder: "The new ticket creation page really needs a lot of
  improvements. For your reference please see ours and Zendesk" — with a
  screenshot of Zendesk's New Ticket screen.

## What the reference is actually doing

Zendesk's new-ticket screen is three columns, and the split is not cosmetic:

1. **Left — properties.** Requester, Assignee (with *take it*), Followers,
   Tags, Type, Priority. Everything about **where this goes**.
2. **Centre — the composer.** Subject, then the message, with attach and
   record in the toolbar, and Submit at the bottom.
3. **Right — what the system already knows.** Merge suggestions, similar
   resolved tickets.

Ours was a single column of fields in the order somebody happened to add them,
with the customer sitting above the subject and no assignee at all.

## Adopted

**The three columns**, stacking on a narrow window with **properties first** —
routing a call is decided before it is typed up.

**Assignee, with `take it`.** Worth copying exactly: the agent typing up the
call is usually the one who will own it, and hunting for their own name in a
list of forty is friction on *every* ticket.

**Queue, tags, priority and language** all move into the properties rail
beside the customer, because all of them answer the same question.

**Apply a macro while logging.** The commonest thing an agent types into a
call log is the sentence they typed yesterday. It **fills** the box rather
than sending anything, so it stays editable.

**A text message is its own channel.** A desk gets texts read out as often as
calls, and logging one as "phone call" makes the channel report wrong.

## Adapted rather than copied: the right rail

Zendesk shows *similar resolved tickets*. The equivalent worth having here is
the **knowledge base**: if an article already answers this, the agent reads it
**while the customer is still on the line** rather than researching after
hanging up. Matched on the subject, debounced, and it only ever offers — it
never fills anything in.

Before a subject is typed it says *what will appear* rather than sitting empty.

## The finding underneath all of it

`POST /api/tickets` has accepted `assigneeId` and `queueId` since it was
written, and validated both against the workspace. **The form never sent
them.** `/api/auth/me` has always returned the user's id; the client-side type
omitted it, so no screen could implement *take it*.

That is the fourth instance of the same pattern this week — something complete
on the server and unreachable from the browser — and it is invisible to every
test in the repo, because both halves are individually correct. Only opening
the page and looking for the control finds it.

## One defect the screenshot caught

Applying a macro pasted its **raw** body, so `{{customer.name}}` landed in the
ticket description for a human to notice later, or not. It now renders through
`renderMacro` — the same function a real send uses — so what lands is what
would be sent. A check asserts no `{{` survives.

The language picker was also rendering `ui_no_name` ("No name") as its empty
option: a different field's string entirely. Both were visible in a screenshot
and in nothing else.

## Not adopted

- **Followers** — nobody has asked to watch a ticket they are not on.
- **Type** (question / incident / problem / task) — a schema change, and tags
  already carry what a desk this size needs.
- **Submit as [status]** — every logged ticket starts NEW here; a picker whose
  only other value is OPEN is a control that does nothing.

## Verified

18 new browser checks: the columns sit either side of the composer and stack
on a phone with properties first, `take it` assigns to the signed-in agent and
the button then disappears, tags commit on Enter *and* comma, the knowledge
rail fills from the subject, an applied macro renders its placeholders — and
**the created ticket really carries the assignee, priority and tags**, which
is the only check that proves the wiring rather than the rendering.

Alongside 23 on the original bug and 29 on attachments: 70 in total, all
against the production standalone build. 5 new strings in all six languages
(441 keys each).
