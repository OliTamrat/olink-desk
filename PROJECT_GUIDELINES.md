# Olink Desk — Standing Project Rules

These rules hold for every session and every contributor. They mirror the
conventions of the Olink fleet (Onekof, Dispatch, School Bus).

## Git & IP

- **NEVER include AI/tool attribution anywhere** — no Co-Authored-By trailers,
  no session URLs, no tool names in commit messages, PR bodies, code comments,
  or documents. This is an IP-registration requirement.
- Commits are authored AND committed as `Oli Tamrat Oli <oli.oli@udc.edu>`.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- `main` is deployable; work in `feat/<slug>` branches.
- Never edit a committed Prisma migration. New schema → new migration.

## Product invariants

- **Multi-tenancy from day one.** Every query touching tenant data filters by
  `organizationId`. There must always be a guard test asserting this.
- **No voice carriage.** Olink Desk logs and orchestrates calls; it never
  carries them. SIP trunking / virtual PBX requires an explicit, licensed
  operator agreement and a new ADR before any code exists.
- **Tool output is truth.** Any AI-assisted feature must never invent
  contact/ticket/call data not present in the database.
- **Audit log everything.** Every agent action writes `AuditLog` with actor,
  action, entityType, entityId (TEXT — always `String(uuid)`), metadata.
- **Localization scope:** English, Amharic, Afaan Oromo, Tigrinya, Somali.
  Customer-facing content is per-tenant bilingual. No other languages.
- **Billing is push-payment.** Chapa/Telebirr/invoice — never assume
  card-on-file auto-renewal exists.

## Engineering conventions

- TypeScript strict mode everywhere; no `any` without an eslint-disable and a
  reason.
- Secrets never committed; `.env.example` is the template. Production secrets
  live in the deployment platform's secret store.
- Structured JSON logs only.
- Low-bandwidth budget: the agent console must stay usable on 3G. Measure
  before adding dependencies.
- Tests before merge: every channel adapter needs a contract test; every
  webhook needs an idempotency test.

## Workflow

1. Plan before code — short plan, thumbs-up, then implement.
2. Surface tradeoffs explicitly before picking.
3. Durable knowledge graduates to `docs/` (OKM); real decisions end the session
   as an ADR in `docs/decisions/`.
4. The operational briefing is `PROJECT_BRIEFING.md` (never create CLAUDE.md).
