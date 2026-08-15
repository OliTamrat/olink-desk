# ADR 0004 — Hosting: GCP Cloud Run staging, portable single image

- **Status:** Accepted
- **Date:** 2026-08-15
- **Decider:** Founder (Oli Tamrat) — "use a GCP project dedicated to Olink
  Desk on the Olink billing account"; Azure considered and declined

## Decision

1. **Staging/demo hosting is Google Cloud Run**, in a dedicated `olink-desk`
   GCP project on the existing Olink billing account (the one Bank Assist
   and Vertex AI already bill to). Region `us-east1`, matching the fleet.
2. **Deploy-on-green**, the Bank Assist pattern verbatim: `deploy.yml` fires
   off CI succeeding on `main`; exactly two GitHub secrets (`GCP_SA_KEY`,
   `GCP_PROJECT_ID`); app secrets live in GCP Secret Manager; migrations run
   before the deploy; deploys queue, never cancel. Until the two secrets
   exist the job skips cleanly instead of failing.
3. **Deployer and runtime are separate service accounts from day one**
   (`olink-desk-deployer` / `olink-desk-runtime`) — the split Bank Assist
   still carries as open work, done here at zero cost because nothing is
   live yet.
4. **The app is one stateless Docker image** (Next.js standalone output,
   `node:20-slim`): sessions are JWTs, credentials are sealed rows in
   Postgres, scheduled work will arrive as cron-hit endpoints. Nothing in
   the image assumes GCP.
5. **Database: managed Postgres reached only through `DATABASE_URL`**
   (Supabase to start — fleet-proven and ~free at this stage). Prisma
   migrations are the only schema path from here on (`migrations/` starts at
   `init`; CI applies the chain to an empty database on every run).

## Why not Azure

No fleet leverage: the only Azure asset is WQIS, a DAPS client deployment,
not a pattern Olink operates. GCP carries the proven deploy workflow, the
Secret Manager conventions, the documented traps (`--set-env-vars` wipes,
default-SA secret access, deploy concurrency), and the founder's operational
familiarity. A third cloud buys nothing and costs all of that.

## The endgame is in-country, and this decision plans for it

Personal Data Protection Proclamation 1321/2024 Art. 22 means real Ethiopian
tenants' customer data must be stored in Ethiopia. Cloud Run is therefore
the **dev/staging/demo** home, not the destination: before real customer
chat/ticket content exists, hosting moves to Ethio Telecom ECS (the Onekof
path) or on-prem at the client. Points 4–5 are what make that move a
re-point of `DATABASE_URL` and a container start, not a rewrite — the reason
this ADR reads as an infrastructure-portability decision wearing a hosting
choice.

## Explicitly deferred

Kubernetes, microservices, queues, read replicas, multi-region. A support
desk's write load is human-paced; one Postgres plus Cloud Run autoscaling
covers the pilot cohort by orders of magnitude. The first real infra
addition will be a scheduler hitting cron-secret endpoints when the SLA
engine lands (Phase 3).
