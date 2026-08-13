# ADR 0001 — Standalone repository on shared fleet patterns

- **Status:** Accepted
- **Date:** 2026-08-13
- **Decider:** Founder (Oli Tamrat)

## Context

Olink Desk (customer support / task / call tracking for the Ethiopian market)
needed a home. Three options were on the table:

1. A module inside `onekof-platform`.
2. A fork of `onekof-platform` stripped down to a support product.
3. A standalone repository on the same stack, porting specific proven modules.

The founding market analysis
(`docs/business/ETHIOPIA_SUPPORT_CALL_TRACKING_MARKET_ANALYSIS.md`, §8)
recommended option 3. The founder confirmed the product must not be linked to
Onekof: it is a dedicated product sold to anyone, not a suite feature.

## Decision

**Standalone repository (`olink-desk`), fresh codebase, same stack as Onekof
(Next.js + TypeScript + Prisma + PostgreSQL, single Docker image), porting
proven modules rather than forking.**

What ports (copy the module and its tests, adapt names):

- From `onekof-platform`: auth/RBAC + progressive lockout, tenant-isolation
  middleware + guard tests, i18n framework + the five reviewed locales +
  Abyssinica SIL, audit logging, residency/tier gating, Docker pipeline.
- From `olink-dispatch`: subscription lifecycle (status / period-end /
  enforcement columns, idempotent renewal webhook, expiry cron, renewal
  walls), adapted from Stripe to Chapa/Telebirr; the cron-secret pattern.

What is new: the omnichannel inbox/threading engine, per-tenant Telegram bot
framework, the SMS aggregator abstraction, call-log UX + CDR import, the
SLA/business-hours engine, the supervisor wallboard.

A second decision is folded in because it shapes the architecture permanently:
**Olink Desk never carries voice traffic in v1.** Calls are logged and
orchestrated, not carried. Commercial voice carriage in Ethiopia is a
licensable activity interconnected through the two operators, and Ethio
Telecom sells its own CCaaS — the product positions beside it, not against it.
Revisiting this requires an operator agreement and a superseding ADR.

## Consequences

- Onekof's release train, schema, and 153k-line PM domain stay out of this
  product; both ship at their own cadence.
- IP registration, INSA certification, and ECA licensing proceed per-product,
  cleanly.
- Ported modules drift from their origins over time; that is accepted — the
  port is a copy, not a shared library. If three products end up maintaining
  the same auth code, extracting a fleet package is a future ADR.
- Onekof integration (ticket ↔ task sync, shared SSO for tenants running
  both) is a feature on the roadmap, not an architectural coupling.

## Alternatives rejected

- **Onekof module:** different buyer (support managers vs project teams),
  different sales motion (per-agent vs per-user), and the founder's explicit
  mandate that the product stand alone.
- **Fork:** drags 172 pages, six editions, and the medical module as dead
  weight; every Onekof migration becomes this product's problem; muddies IP
  separation.
