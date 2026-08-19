# 0041 — The product page demonstrates the desk rather than describing it

**Status:** accepted · 2026-08-19

## Context

`/` was a placeholder from the first week of the repo: a heading, one sentence
and a **Sign in** button, centred on an empty background. Every screen behind
it had been rebuilt several times; the one page a stranger loads cold had
never been touched.

The founder's brief arrived as two screenshots — Zendesk's AI-powered service
platform page, and the Sunshine Conversations split-screen sign-in — with:

> I was expecting something like this, a very creative way of showing the
> service, or build a comprehensive design.

The instructive half is *showing the service*. What those pages have in common
is not a colour or a layout; it is that neither of them asks the reader to
take a claim on trust when it could show the thing instead.

## Decision

**The page runs the product's whole loop in front of the reader, above the
fold, before it makes a single claim below it.**

`LiveDesk` in `apps/web/src/lib/site.tsx` plays one ordinary customer question
all the way through the desk — the message arrives on a real channel, a ticket
opens, the language and urgency are read, a reply is drafted from the
organization's own answers with its sources attached, and the first reply goes
out inside the SLA — then the channel and the language change and it happens
again. Five channels, six languages, about nine seconds each.

Everything the page says further down has therefore already been shown: the
channel strip, the arrive/understand/answer loop, the capability grid, the
console, the trust rows. They are captions on a demonstration rather than
assertions on a blank page.

## Why not a screenshot, or a video

A screenshot is a PNG that goes stale the first time the rail moves, carries
whatever tenant's data happened to be on screen when it was taken, and is one
theme on a product whose theming is part of the pitch. `ConsoleShot` is drawn
from the same tokens as the real console instead, so it is always current and
follows the reader's own theme — which is the claim that section is making.

A video would have all of the same problems plus a download, and would have to
pick one language.

**And a still has to pick ONE language to illustrate a product whose whole
point is six.** Whichever it picks is wrong for five sixths of the room. That
is the same argument that produced the sign-in mock (Bank Assist ADR 0029),
one level up — which is also why the demonstration reuses that mock's exact
question and answer pair rather than inventing a second example. Two examples
across the two screens a prospect sees would read as two features; one example
reads as one loop.

## What is fixed rather than incidental

- **The hero and the closing band are dark in BOTH themes**, using the `stage`
  tokens, exactly like the sign-in pitch pane. They are stages, not page
  surfaces; wiring them to `--bg` would turn the two screens whose job is to
  look like something white for a light-theme reader. Everything between them
  uses `colors` and follows the reader's theme.
- **`box-sizing: border-box` is scoped to `.site`.** The repo deliberately
  omits a global one — it would silently change the geometry of every
  fixed-width pane in the console.
- **The demo only runs while it can be seen.** An IntersectionObserver plus
  `visibilitychange`: this is a long page and a marketing page is the one most
  likely to sit open in a background tab.
- **Every offset in the cycle is measured from one clock.** Chaining each
  timeout off the previous callback adds the offsets a second time, which is
  how the sign-in mock once took twelve seconds per language instead of six
  and never visibly turned over.
- **Reserved heights** on the draft box and the desk pane. A box that grows
  and shrinks as each language's answer types in is the most distracting thing
  that could happen on this page.

## The strings

Forty-seven new keys, all six languages, in the same change — the golden rule
applies to a marketing page as much as to a form. Two notes for the reviewer
are worth repeating here because they are the ones most likely to be undone:

- `ui_site_hero_line` and `ui_site_loop_line` are **composed**, not
  translated. The first is a claim about consolidation and the second is three
  verbs in order; both should be said the way each language would say them.
- `ui_site_trust_4` is the most important sentence on the page and states a
  safety property: the auto-answer floor is deterministic rules, and the model
  may only refuse, never authorise. A translation that suggests the model
  decides is wrong even if it reads better.

`ui_site_demo_draft_label` exists because the first build labelled the drafted
reply with `ui_ai_draft`. That key is a BUTTON — "Draft with AI" — and five of
its six translations are imperative verbs. As a label over a box it read as an
instruction in every language except English, which is invisible from an
English screenshot and exactly what the "measure the call sites, not the
table" rule is about.

## Consequences

- `/` is now a client component with a running timer. It is the only page in
  the product that animates on load.
- The page is checked in a browser at three viewports and in Amharic and
  Tigrinya, for horizontal overflow with clipped decoration excluded — the
  aurora is meant to run off the edge, and comparing rectangles alone reports
  360px of "overflow" on a hero that cannot scroll by a pixel.
- Not built, deliberately: pricing, customer logos and any number about
  adoption. There are no production deployments yet, so a metric on this page
  would have to be invented.
