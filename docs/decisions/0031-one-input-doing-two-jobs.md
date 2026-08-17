# ADR 0031 — One input doing two jobs, and the error that pointed at nothing

- **Status:** Accepted
- **Date:** 2026-08-17
- **Context:** Founder, with a screenshot of `/inbox/new`: "I was not able to
  create a ticket (both in person and phone call), the error saying the phone
  number wasn't recognised — first of all there is no phone call input field."

## Both halves of that were true

The customer block had ONE input, labelled *Customer*, placeholdered as a
search. It searched. And when nothing was picked, `submit()` posted **the same
text as `phone`**:

```ts
...(picked ? { contactId: picked.id }
  : customerQuery.trim() ? { phone: customerQuery, name: newName } : {})
```

So typing a person's **name** — the obvious thing to type into a box labelled
Customer — reached `cleanContact()`, failed `normalizePhone()`, and returned
"That phone number was not recognised", **naming a field the form did not
have**. There was nothing on screen to correct.

It did the same on a **walk-in**, where the customer may have left no number at
all, and the accompanying warning told the agent to call them back.

The rule this breaks is worth stating plainly, because the code looked
reasonable in isolation: **an input may not silently change what it means
based on state the user cannot see.** "Search box, unless nothing matched, in
which case it is a phone number" is two controls wearing one label, and the
error message is written against the second one.

## What it is now

- **Search is only ever search.** What is typed there is never submitted.
- **New customer is a deliberate choice** — a `+ New customer` button opens a
  panel with its own labelled **Name**, **Phone** and **Email** fields. It is
  not inferred from a search returning nothing, because "no match yet" is also
  what a half-typed name looks like.
- The search text **seeds the name field** rather than being thrown away — it
  is almost always the person's name.
- **A dialling-code picker** sits beside the number. The code is prefixed only
  when the agent did *not* type a local (`0…`) or already-international
  (`+`/`00`) form: gluing `+251` onto `0911…` would invalidate every correctly
  typed number.
- **Validation happens at the field, as it is typed** — the bad-number line
  sits under the input it is about, and a good number is echoed back in the
  local readable form (`0911 234 567`), which is what an agent reads back to a
  customer. Not the E.164 the database stores.
- **The submit button states why it is disabled**, in reading order — the
  customer block sits above the subject, so a missing customer is reported
  before a missing subject. A greyed-out control with no reason attached is
  the same dead end as an error after submit, one step earlier.
- **The walk-in warning is its own sentence.** A visit is not answered by
  phoning them back.

Phone stays optional and email is a first-class alternative, because
`cleanContact` requires *one of* the two — that constraint is right (a person
with neither cannot be recognised next time) and it now appears as a *reason
at the point of asking* rather than a refusal after the fact.

## Why no test caught it

There is no test for this page. But the sharper point: an API test would have
passed, because the API behaved exactly as written — `phone: "Oli"` *is*
unrecognisable. The defect only exists in the **join** between a form that
decided to send a name as a phone and an API that correctly rejected it.

That is the fifth instance this week of the same shape, and this one is the
clearest: **both halves were individually correct.** Only driving the screen
the way a person uses it finds this class of thing.

## Still open — the four feature asks in the same message

Named here so they are tracked rather than implied: **AI-assisted drafting**,
**file attachments**, **voice recording for voicemail**, and a fuller
the global platforms-shaped composer. Attachments and voice both need a blob store this
project does not yet have (no `Attachment` model, no bucket), and drafting
needs an LLM provider and key — none is configured anywhere in this repo.
Those are infrastructure decisions, not code that can be written and shipped
blind. The form fix above does not wait on any of them.

## Verified

23 browser checks against the production standalone build, opening with the
founder's exact sequence: type a name into the customer box, on both channels.
Also covers a walk-in with no phone, a customer with neither phone nor email
being refused with the reason, and an existing customer being reused rather
than duplicated. 8 new strings in all six languages (428 keys each).
