# ADR 0024 — Channels you can actually connect

- **Status:** Accepted
- **Date:** 2026-08-16
- **Context:** Email, SMS, USSD and the Meta three were all built, tested and
  routed. Only Telegram had a form. Connecting any of the others meant
  hand-crafting a `PUT` with curl — which is to say the founder was being told
  "waiting on you" for a step there was no way to take.

## A capability nobody can reach is not shipped

`PUT /api/orgs/{slug}/channels/{kind}` has validated these fields since the
channels were written. It seals the config, mints a webhook secret, writes an
audit row and returns the secret exactly once. All of that worked. None of it
was reachable from a browser.

This is the same failure recorded in the i18n work a few hours earlier: **the
thing measuring completeness was measuring something adjacent to it.** The
channel was "built" by every test in the repo and unusable by every operator.

## The half that was missing everywhere: where the far end points

Storing credentials only tells the desk **how to send**. A channel is connected
when messages **arrive**, and messages arrive because somebody pasted our
inbound URL and its secret into Postmark, or into an aggregator's dashboard.

Nothing displayed that URL. It is not guessable — it carries the tenant slug —
and the header name is not guessable either. Both are now shown on the card,
**before** anything is saved, so an operator can set up the far end and the
near end in one sitting.

The secret is shown **once**, because the API returns it once. A secret
re-readable from a page is a secret sitting in every cache that page touched;
saving again mints a new one.

## Meta is not like the others, and saying otherwise costs an afternoon

The first build showed every channel the same line: *send the secret in the
`X-Hub-Signature-256` header*. For email, SMS and USSD that is right — those
gateways send back a secret **we** minted.

For Meta it is an instruction nobody can follow. Meta computes that signature
itself from the app secret; there is no field anywhere in its dashboard to put
a secret into, and an operator would go looking for one. Those cards now
explain the verify-token handshake instead.

**This was found by a mis-scoped check**, not by review: an unscoped
`[data-webhook-target]` matched WhatsApp's block while claiming to test
email's — the ADR 0019 selector mistake again. Scoping it correctly turned a
false failure into a real finding.

## `authHeaderName`

`EmailConfig.authHeader` was sent hard-coded as `Authorization`, under a
docstring that said "Resend, Postmark, anything". Postmark rejects
`Authorization` outright and wants `X-Postmark-Server-Token` — so one of those
three names was untrue, and a config built for it would have looked perfectly
valid while every send failed. The header name is now configurable, defaulting
to `Authorization`.

## Two rules the form follows

- **The boxes empty once stored.** An access token left sitting in a text box
  on a shared desk is not a saving of anybody's time.
- **Switching provider clears the form.** `authHeader` is one field name shared
  by three SMS vendors; carrying AfroMessage's key into GeezSMS's form saves a
  config that can never authenticate.

## The form and the route are held together by a test

They are two files written by two hands, and a mismatch fails in the worst
available way: the form looks complete, the operator fills it in, and the API
answers `400 "senderId is required"` about a box sitting right there full of
text. Worse, a misspelled **optional** field raises nothing at all and saves a
channel that cannot send.

`packages/channels/test/setup-form.test.ts` parses both sides and asserts they
agree — every required field has a box, no required box is marked optional, and
no offered kind is unknown to the route. It also asserts it **parsed something**
first: its own key regex missed `email` and `ussd` (bare keys, not quoted) and
would otherwise have passed by testing nothing, skipping exactly the two
channels this work exists to connect.

## Verified

18 browser checks against the production standalone build. The one that matters
is end to end and not about the form at all: fill it in, read the secret off the
screen, POST an email to the displayed URL with that secret — **and a ticket
appears in the inbox**. A wrong secret gets 401. That is the whole loop, driven
the way an operator would drive it.

23 new strings in all six languages.
