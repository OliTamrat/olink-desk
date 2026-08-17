# Olink Desk

### An AI-powered support desk for the places Zendesk does not reach

**Omnichannel ticketing on the channels Ethiopian customers actually use —
Telegram, USSD, SMS, WhatsApp — answered in six languages, with the data
resident in-country.**

Built by **Olink Technologies PLC**. A standalone product in the Olink fleet
(alongside Onekof PM, Olink Dispatch, Olink School Bus, Olink Bank Assist).

---

## Status, honestly

**Deployed and healthy on Cloud Run. No pilot customer yet.**

That second sentence is the most important line in this file. The software runs
— CI-gated, smoke-tested on every deploy — but no real desk has run a day's
traffic through it. Every performance and workflow claim below is a design
intention until a pilot proves it.

| | |
|---|---|
| Deployment | Live, `us-east1`, CI → deploy → `/api/health` gate |
| Pilot customers | **None yet** — the single biggest risk |
| Data residency | **Not yet in-country** — see "The moat" below |
| Languages | 6 shipped; **EN + AM reviewed, OM/TI/SO/SW are drafts** |

---

## What actually works today

**Nine channels**, all built: Telegram, website widget, WhatsApp, Messenger,
Instagram, Viber, SMS, email, USSD. Each has its own page under Channels; a
provider's credentials are AES-256-GCM encrypted at rest and inbound webhooks
verify HMAC signatures in constant time.

**The agent workspace** — saved views, filters, search, a three-column ticket
with the customer's history beside it, internal notes, bulk actions, and open
ticket tabs that survive a reload without losing a draft.

**Service levels** — per-priority SLA policies over real business hours, with
first-response and resolution clocks, queues, and a wallboard built to be read
across a room.

**Macros and a knowledge base**, both written once per language, with BM25
retrieval and an informativeness gate that makes the desk say "I don't know"
rather than return a confident near-miss.

**Attachments and voice notes** on any ticket — content type sniffed from the
bytes rather than trusted from the browser, and only images and audio ever
served inline.

**AI reply drafting** on Gemini via Vertex AI, authenticated by the Cloud Run
revision's own service account — **there is no API key anywhere**. It drafts
into the composer; a person edits and sends. Inert until
`roles/aiplatform.user` is granted; `/api/health` reports exactly which.

**Reports and CSAT** — volume, medians, first-reply-on-time, satisfaction, and
what people contacted you about, each carrying the denominator it rests on.

## What is designed but not built

Named here rather than implied, because a README that describes intentions as
features is how a repo starts lying about itself:

- **Billing.** No Chapa, no Telebirr, no subscription enforcement. The pricing
  model is a decision, not code.
- **In-country deployment.** The Ethio Telecom ECS path exists in Onekof and
  has not been walked here.
- **Call tracking depth.** Tickets carry a `PHONE` channel; disposition codes,
  callback queues and CDR import are schema, not screens.
- **Ethiopian calendar and July fiscal year.**
- **SSO/SAML, retention and deletion, audit export.** The enterprise gate.

## The moat is not the AI

Gemini is available to Zendesk too. Three things are actually defensible:

1. **Data residency.** Proclamation 1321/2024 Art. 22 requires personal data
   collected in Ethiopia to be stored in Ethiopia — and support tickets are
   personal data. Foreign SaaS desks cannot comply without building Ethiopian
   infrastructure. **This is currently a blocker for us, not a moat**: we run
   in Virginia. Converting it is the highest-leverage work available, and the
   same machinery serves Kenya's DPA 2019, Nigeria's NDPA 2023 and GDPR.
2. **The channel mix.** Telegram dominates here; USSD reaches feature phones
   with no data at all. Zendesk does neither — that is market access, not a
   feature gap.
3. **Six languages** including Amharic, Afaan Oromo, Tigrinya, Somali and
   Swahili. Nobody else serves these — though four of the six are still
   unreviewed drafts, so the moat is real but unverified.

## Stack

- **Web:** Next.js 14 App Router, TypeScript strict, no CSS framework — a
  token-based theme in `apps/web/src/lib/theme.ts` with light/dark/system
- **DB:** PostgreSQL + Prisma. Every tenant-data query filters by
  `organizationId`, enforced by a guard test that walks the schema itself
- **AI:** Gemini over Vertex AI, metadata-server auth, no key
- **Deploy:** one Docker image → Cloud Run, GitHub Actions, post-deploy health gate

## Repository map

```
apps/web/            Next.js: agent console, supervisor console, admin, widget
packages/ai/         Gemini over Vertex — reply drafting, no API key
packages/auth/       Passwords, sessions, lockout, rate limiting
packages/channels/   Nine channel adapters + the shared inbound spine
packages/csat/       Satisfaction scores: parsing a reply, and when to ask
packages/database/   Prisma schema + client (the domain model)
packages/i18n/       Six-language string tables and language detection
packages/macros/     Macro rendering — customer-language pick and placeholders
packages/reports/    The statistics the two reports are built from
packages/retrieval/  BM25 over the knowledge base, with the relevance gate
packages/sla/        Business-hours arithmetic and per-priority policies
packages/tickets/    Opening tickets, customer identity, attachments
docs/decisions/      37 ADRs — why each load-bearing choice was made
```

## Getting started

```bash
pnpm install
cp .env.example .env      # DATABASE_URL, JWT_SECRET, CHANNEL_CONFIG_KEY
pnpm --filter @olink-desk/database exec prisma migrate deploy
pnpm dev
```

`CHANNEL_CONFIG_KEY` must be 32 bytes base64 (`openssl rand -base64 32`) — a
hex string of the same length will fail at runtime, not at startup.

## Rules that don't bend

1. **Multi-tenancy from day one.** Every tenant-data query filters by
   `organizationId`, from the *session* and never from a URL. A guard test
   walks `schema.prisma` and fails on a model without the column and index.
2. **Six languages, in the same change.** A pull request that adds an
   English-only string is incomplete the way a failing test is incomplete.
3. **Never carry voice traffic.** Logging and orchestration only, until a
   licensed-operator agreement exists (ADR 0001).
4. **Migrations are append-only.** Never edit a committed migration.
5. **Audit everything an agent does** — actor, action, entity, metadata, and
   never the customer's words.
6. **No secrets in the repo**, and no API key for the model — the runtime
   identity is the credential.
7. **Drive the real screen before believing it.** More defects in this repo
   have been found by opening the page than by any test, and the ADRs say so
   repeatedly.

## Why the ADRs matter

`docs/decisions/` holds 37 of them, and they are load-bearing rather than
ceremonial: they record why the informativeness gate exists, why attachments
live in Postgres for now, why the rate limiter reads the *last* forwarded
address, and which checks have historically measured the wrong thing. Read the
index before re-deriving a decision.

---

**License:** Proprietary — Olink Technologies PLC. Do not redistribute.
