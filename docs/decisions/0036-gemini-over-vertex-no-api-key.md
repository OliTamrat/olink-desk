# ADR 0036 — Reply drafting on Gemini over Vertex, with no API key

- **Status:** Accepted
- **Date:** 2026-08-17
- **Context:** Founder: "For LLM and AI you have my billing account and access
  to my gcloud account."

## What I could and could not do with that

I have **no `gcloud` and no GCP credentials in this sandbox** — checked, not
assumed. Outbound reach to `aiplatform.googleapis.com` exists (real 404s, not
proxy refusals), but reach without an identity is not access. So the two
commands still have to run somewhere with credentials.

What I *could* do is remove every other reason this was blocked: the client,
the endpoint, the button, the health probe, and the project-enablement step in
the deploy. The remaining human action is one IAM grant.

## No API key. Ever.

On Cloud Run the token comes from the **metadata server**, so the credential is
the revision's own service account: nothing to store, nothing to leak, nothing
to rotate. Ported from Bank Assist, along with the two things that repo
learned the hard way:

1. **Do not reach for `google.auth.transport` or an SDK.** They pull a
   transitive HTTP client this app does not install; the import throws, and the
   service reports "vertex" while every call silently falls through. A plain
   fetch against the metadata endpoint has no such failure mode.
2. **`thinkingBudget` is a required argument, not a defaulted one.** On Gemini
   2.5 `maxOutputTokens` caps thinking AND answer together, so an
   under-budgeted call returns a candidate with **no parts at all**. Bank
   Assist shipped a path that was dead in production for exactly this, with
   every test green. A default would make the next mis-sized call an accident
   rather than a decision. `generate` adds the two together explicitly, and a
   test asserts the arithmetic.

## Why this needs less safety apparatus than Bank Assist

Bank Assist answers a customer directly, so a hallucinated rate reaches them,
and it carries intent allowlists, an informativeness gate and a decline
sentinel to prevent it.

**This drafts.** The output lands in the box the agent is about to type in;
nothing leaves the desk until a person presses Send. That is the whole
difference, and it is why a smaller prompt is enough. The prompt still forbids
inventing a price, fee, rate, deadline, account detail, phone number, branch or
policy — a plausible wrong figure is harder to notice than an obvious gap —
and it draws only on the conversation plus the desk's **published** articles.
Draft articles are excluded: an unapproved article's words must not reach a
customer through a side door.

## The button is absent, not broken, when there is no model

`/api/tickets/[id]/draft` answers **501** when `GOOGLE_CLOUD_PROJECT` is unset.
The console probes that once per ticket and hides the control. A button that is
present and always fails is worse than no button.

## Health probes rather than asserts

`isConfigured()` only says an env var exists. `GET /api/health` **calls the
model** and reports whether it answers, because "API not enabled" and "service
account missing `roles/aiplatform.user`" are invisible from the outside until
something is called — and they are the two things most likely to be wrong.

It **never fails the health check**: a desk with no drafting is fully working,
and turning a green deployment red over an optional feature would stop real
deploys.

A 403 from Vertex is re-thrown naming `roles/aiplatform.user` and
`aiplatform.googleapis.com` explicitly. "403" alone sends the reader to the
wrong file.

## The deploy enables the API

`gcloud services enable aiplatform.googleapis.com` runs before the deploy,
idempotently, **without `|| exit 1`**: a deployer service account lacking
`serviceusage` permission is a question for a human, not a reason to block a
deploy of everything else. It logs a GitHub warning naming the fix. The
revision also now carries `GOOGLE_CLOUD_PROJECT` and `VERTEX_LOCATION`
(`--set-env-vars` on the deploy, before the later `--update-env-vars` that
merges `APP_BASE_URL` — that order matters, and reversing it would wipe them).

## Still needed from a human — one command

```
gcloud projects add-iam-policy-binding <PROJECT_ID> \
  --member="serviceAccount:olink-desk-runtime@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

Deliberately **not** put in the workflow. A deploy pipeline that grants itself
IAM is a privilege-escalation path, and this one already runs on every push to
`main`. Cloud Shell is the shortest route — gcloud is preinstalled and already
authenticated there.

`GET /api/health` reports `ai: ok` the moment it lands.

## Verified

18 unit tests, including that thinking is budgeted on top of the answer, that a
403 names the missing role, that thought parts never reach the agent, that a
missing candidate names its `finishReason`, and that the token is cached until
shortly before expiry.

Driven for real in both states: unconfigured → health says `ai: off` and the
endpoint returns **501 `not_configured`**; configured but off Cloud Run →
health says **`fail: metadata server unreachable`**, which is the truth.

**The one thing not verified is a real generation**, because that needs the IAM
grant. I have not claimed otherwise anywhere in the code or the UI.
