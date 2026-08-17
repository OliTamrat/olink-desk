<div align="center">

# Olink Desk

**The AI-powered customer support platform for the channels the rest of the world forgot.**

Omnichannel ticketing, service-level management and AI-assisted resolution —
on Telegram, USSD, SMS, WhatsApp and the web, in six languages, built to run
inside the country whose data-protection law requires it.

`Multi-tenant SaaS` · `9 channels` · `6 languages` · `Gemini on Vertex AI` · `Next.js + Postgres on Cloud Run`

</div>

---

## What Olink Desk is

Every organisation that serves customers has the same problem: the requests
arrive everywhere — a Telegram message, a phone call, a walk-in, an SMS, an
email — and nothing joins them up. Agents work from a phone in one hand and a
spreadsheet in the other. Nobody can say how long a customer waited, what was
promised, or whether anyone followed up.

Olink Desk is one workspace where every one of those interactions becomes a
**ticket** with an owner, a clock and a history — regardless of how it arrived.
Customers are answered on the channel they chose, in the language they wrote
in. Agents get an AI-drafted first reply built from the desk's own approved
knowledge. Supervisors get service levels that are measured rather than hoped
for.

It is built by **Olink Technologies PLC** for a market the global platforms do
not serve: Telegram-dominant, phone-heavy, feature-phone-inclusive,
multilingual, and legally required to keep its data at home.

**Who it is for** — banks and microfinance institutions, telecoms, insurers,
government service desks, logistics and delivery operators, and any business
whose customers already message them and expect an answer.

---

## Capabilities

### Omnichannel intake

Nine channels, each a first-class citizen of the same ticket model. A customer
who starts on Telegram and follows up by SMS is one person with one history.

| Channel | What it is | Setup |
|---|---|---|
| **Telegram** | A bot per workspace — the dominant messaging channel in Ethiopia | Self-serve: paste a BotFather token |
| **Website widget** | An embeddable chat bubble, hosted for you | Self-serve: paste one `<script>` tag |
| **WhatsApp** | Meta Cloud API | Meta Business verification |
| **Messenger** | Facebook Page inbox | Meta Business verification |
| **Instagram Direct** | Professional-account DMs | Meta Business verification |
| **Viber** | Public account bot | Self-serve: partner token |
| **SMS** | AfroMessage, GeezSMS or FalconVAS | Aggregator agreement |
| **Email** | Forward a support address; replies thread back | Inbound-parse service |
| **USSD** | `*code#` from any phone — no smartphone, no data, no app | Telecom gateway agreement |

Plus **phone calls and walk-ins**, logged by an agent at the counter or on the
line, so the desk's reports describe the whole day rather than only the part
that arrived electronically.

Every channel's credentials are encrypted at rest, and every inbound webhook
verifies the provider's signature before a byte is trusted.

### The agent workspace

Built to the shape agents already know, then sharpened for how this market
works.

- **Saved views and filters** — my work, unassigned, all open, recently solved —
  composing with status, channel, priority, queue, assignee and full-text search
- **A three-column ticket**: properties, the conversation, and the customer's
  own history beside it, so nobody asks a returning customer to explain twice
- **Open ticket tabs** that survive a reload without losing a draft reply
- **Internal notes** alongside public replies, never confusable
- **Bulk actions** across a filtered list
- **Attachments and voice notes** — a screenshot of the error, a scanned form,
  or a voicemail recorded straight into the ticket
- **Macros**: saved replies that carry a body in *every* language the desk
  serves and can set status, priority and tags in one click

### AI that assists rather than answers

Gemini on Vertex AI drafts a first reply from the conversation and the desk's
**published** knowledge articles — in the customer's own language, composed
rather than translated. The agent reads, edits and sends.

The prompt is forbidden from inventing a price, fee, rate, deadline, account
detail or policy: a plausible wrong figure is harder to catch than an obvious
gap. Draft articles are excluded, so unapproved wording cannot reach a customer
through a side door.

There is **no API key anywhere** — the runtime service account is the
credential, so there is nothing to store, leak or rotate.

### Service levels that are actually measured

- Per-priority SLA policies over **real business hours** in the workspace's own
  timezone, with separate first-response and resolution clocks
- **Queues** for routing by team, product or region
- A **wallboard** built to be read across a room: what's open, what's at risk,
  what's breached, and who's carrying it
- **Escalation** when a promise is about to be broken, not after

### Knowledge and deflection

Articles written once per language, searched by a BM25 retriever tuned so the
desk says *"I don't know"* rather than returning a confident near-miss. Every
article counts the tickets it prevented — the number that says whether writing
it was worth the afternoon.

### Reporting and satisfaction

Volume, median first reply, median resolution, first-replies-on-time,
satisfaction, what people contacted you about, and the channel and language
mix — each figure carrying the denominator it rests on, because a median over
two tickets and over two hundred are different facts wearing the same number.

### Six languages, everywhere

**English, Amharic, Afaan Oromo, Tigrinya, Somali and Swahili** — in the
customer's replies, in the agent console, in macros and in knowledge articles.
A feature is not finished here until its words exist in all six.

---

## Why it is built this way

| The reality of this market | What Olink Desk does about it |
|---|---|
| Telegram beats WhatsApp; banks and telecoms already run support there | A first-class Telegram bot per workspace, self-serve in a minute |
| Millions of customers have a feature phone and no data | USSD — a session-based ticket from any handset ever made |
| Support is phone-first | Call and walk-in logging with the same ticket model, assignment and SLA |
| Personal data collected in Ethiopia must be stored in Ethiopia (Proclamation 1321/2024, Art. 22) | Single-image deployment designed for in-country hosting |
| Customers think in Amharic and Afaan Oromo; support is English-first | Six languages end to end, with detection on the inbound message |
| Network interruptions are a fact of operations | SMS and voice fallbacks; no dependency on a single channel |

---

## Architecture

A pnpm monorepo. One Next.js application, eleven domain packages, one Docker
image.

```
apps/web/            Agent console, supervisor console, admin, customer widget
packages/ai/         Gemini over Vertex AI — drafting, metadata-server auth
packages/auth/       Passwords, sessions, progressive lockout, rate limiting
packages/channels/   Nine channel adapters + the shared inbound spine
packages/csat/       Satisfaction: parsing a reply, and when to ask
packages/database/   Prisma schema + client — the domain model
packages/i18n/       Six-language string tables and language detection
packages/macros/     Macro rendering: language pick and placeholders
packages/reports/    The statistics behind the two report surfaces
packages/retrieval/  BM25 over the knowledge base, with the relevance gate
packages/sla/        Business-hours arithmetic and per-priority policies
packages/tickets/    Ticket opening, customer identity, attachments
```

**Multi-tenancy is structural, not conventional.** Every query touching tenant
data filters by `organizationId` taken from the *session* — never from a URL —
and a guard test walks the Prisma schema itself, failing the build on any
tenant model missing the column and its index.

**Stack** — Next.js 14 (App Router), TypeScript strict, PostgreSQL + Prisma, a
token-based theme with light/dark/system, Gemini on Vertex AI, deployed as a
single container to Cloud Run by GitHub Actions with a post-deploy health gate.

---

## Security and compliance

| | |
|---|---|
| **Tenant isolation** | Session-scoped on every query; enforced by a schema guard test |
| **Credentials at rest** | AES-256-GCM for every channel's provider secrets |
| **Webhooks** | HMAC signature verification, constant-time, fail-closed |
| **Passwords** | bcrypt with progressive account lockout |
| **Rate limiting** | Token bucket in middleware — new routes are covered by default |
| **Uploads** | Content type sniffed from bytes; only images and audio ever inline |
| **AI credentials** | None. The runtime service account is the credential |
| **Audit** | Every agent action logged with actor, action, entity — never the customer's words |
| **Roles** | Admin, Supervisor, Agent, Auditor |

---

## Roadmap

### Now — through the first pilot

Making one real desk run a real day.

- **Data lifecycle** — retention windows, customer deletion, and audit export.
  A legal obligation under the same law that shapes the product, and the first
  question of every security review.
- **Native language review** for Afaan Oromo, Tigrinya, Somali and Swahili.
- **Object storage** for attachments, replacing the deliberate interim.
- **Load characterisation** — replace an estimate with a number.

### Next — enterprise readiness

- **In-country deployment** on Ethio Telecom ECS, plus an on-premise image for
  institutions that require it. This turns a compliance obligation into a
  competitive position no foreign platform can match.
- **SSO / SAML**, granular permissions and IP allowlists.
- **Billing** — Chapa and Telebirr push-payment subscriptions in ETB, with
  proforma invoicing for enterprise procurement.
- **Call centre depth** — disposition codes, callback queues, CDR import, and
  agent occupancy reporting.
- **AI triage** — routing, priority and language decided on arrival, so the
  queue is already sorted when an agent opens it.

### Over the horizon — where this becomes a platform

- **Autonomous resolution.** The knowledge base answers directly behind a
  confidence gate, with every deflection measured and every uncertain case
  handed to a person. This is where AI stops being a feature and becomes
  margin.
- **Conversational voice and USSD self-service** — the same knowledge, reachable
  by a customer who has neither a smartphone nor literacy in a written channel.
- **Quality intelligence** — automatic reply scoring and coaching signals, so
  supervision scales past reading tickets one at a time.
- **Regional expansion** — Kenya, Nigeria, Tanzania. The residency machinery
  built for Ethiopia's Article 22 is the same machinery that satisfies Kenya's
  DPA 2019, Nigeria's NDPA 2023 and GDPR, which makes each new market an
  onboarding exercise rather than a rebuild.
- **Platform surface** — a public API, webhooks out, and integrations with core
  banking, ERP and CRM systems.

---

## Getting started

```bash
pnpm install
cp .env.example .env      # DATABASE_URL, JWT_SECRET, CHANNEL_CONFIG_KEY
pnpm --filter @olink-desk/database exec prisma migrate deploy
pnpm dev
```

Open `http://localhost:3000/register`, create a workspace, and connect Telegram
or the website widget from **Channels** — both are self-serve and take about a
minute.

> `CHANNEL_CONFIG_KEY` must be 32 bytes base64 (`openssl rand -base64 32`). A
> hex string of the same length fails at runtime rather than at startup.

**Deployment** is a single container. `main` builds, migrates and deploys to
Cloud Run on every green CI run, and the deploy is not called done until the
new revision answers `GET /api/health` — which reports the database, the
secrets, and whether the model actually responds.

---

## Engineering conventions

1. **Multi-tenancy from day one.** Session-scoped, guard-tested, non-negotiable.
2. **Six languages in the same change.** A pull request that adds an
   English-only string is incomplete the way a failing test is incomplete.
3. **Migrations are append-only.** Never edit a committed migration.
4. **Audit every agent action** — and never the customer's words.
5. **No secrets in the repository**, and no API key for the model.
6. **Drive the real screen before believing it.** More defects here have been
   found by opening the page than by any test.
7. **Record the decision.** `docs/decisions/` holds 37 ADRs explaining why each
   load-bearing choice was made. Read the index before re-deriving one.

**Project status:** deployed and operating; pilot onboarding in progress.
Capabilities above are shipped unless listed under *Roadmap*.

---

<div align="center">

**Olink Desk** — part of the Olink fleet, alongside
Onekof PM · Olink Dispatch · Olink School Bus · Olink Bank Assist

Proprietary software © Olink Technologies PLC. All rights reserved.

</div>
