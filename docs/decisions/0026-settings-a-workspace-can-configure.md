# ADR 0026 — Settings a workspace can actually configure

- **Status:** Accepted
- **Date:** 2026-08-17
- **Context:** Founder, from a live screenshot: "overall the settings page
  needs a major enhancement." It held four rows of unexplained minute boxes, a
  checkbox, and a Save button, behind a strip of three pills.

## The enhancement is a missing capability, not a layout

`Organization` has carried `name`, `timezone`, `languages` and
`defaultLanguage` since the first migration. **None of them had a screen.** A
workspace could not be renamed after registration, its time zone was whatever
the default said whatever country it was in, and the language set that decides
what a customer is answered in was unreachable from the product.

This is the third instance today of the same shape — the channels forms, the
review sheet, and now this: *something complete in the schema and unreachable
from the browser*. Worth naming as a pattern, because it is invisible to every
test in the repo.

## The rule that fails silently

**The fallback language must be one the desk actually staffs.** It is what a
reply falls back to when we cannot tell what somebody wrote in, so a fallback
outside the served set answers customers in a language nobody on the team
reads — and every field looks valid on its own, so nothing complains.

Enforced in three places, deliberately:

1. `cleanWorkspaceProfile` refuses it, with a test.
2. The picker only offers served languages, so it cannot be built.
3. Turning off the language that *was* the fallback moves the fallback rather
   than leaving an invalid pair for the save to reject with an error the admin
   cannot act on from that screen.

An empty language set is refused too. That is not "unrestricted", it is a desk
that cannot answer anybody.

## The slug is read-only, and the reason is on screen

It is inside the widget snippet on the customer's own website and inside every
webhook URL a gateway has been pointed at. Changing it breaks all of them
silently. A greyed-out box invites a support ticket asking why; the sentence
under it answers the question where it is asked.

## Sections in the rail, not a strip of pills

Settings grew a fourth section and will grow a fifth. A horizontal strip runs
out of room and reads as less important than the page beneath it.

They now use the shell's **own second layer** — the same slot the inbox's views
occupy — so they fold with it and cost no page width when unwanted, and the
mobile layout already knows how to render that slot inline.

**The fold control now names what it folds.** It said "Hide views" on a page
with no views in it, which is the console describing its own plumbing.
`sidePanelLabels` defaults to the inbox's wording, which is precise there.

## Minutes read as durations

`1620 minutes` is arithmetic homework; `1d 3h` is an answer, and it is the
number an admin is deciding about. The box still takes minutes — that is what
the engine stores and what a person types — with the human reading beside it.

One line above the grid says what the two promises mean and that they are what
colours the inbox (ADR 0023). Without it the section is a form rather than a
decision.

## Verified

23 browser checks against the production standalone build: the rename reaching
the rest of the console rather than just the form, the API refusing an
unstaffed fallback **with a translatable key rather than an English sentence**,
the picker never offering one, an agent getting 403 on the write while the
record stays untouched, and the sections still reachable at 390px where there
is no rail at all.

21 new strings in all six languages.
