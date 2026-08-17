# Grant the runtime service account access to Vertex AI

**Status: DONE — 2026-08-17.** `GET /api/health` reports `"ai":"ok"`, which
means the model answered a real prompt rather than that a variable is set.

Kept for the next environment (staging, or an in-country deployment), where
the same two steps are needed again from scratch.

> **The wrong API is easy to enable.** Searching "Vertex AI" in the console's
> API library returns several products, and **Vertex AI Search for commerce**
> (`retail.googleapis.com`) is one of them — retail product search, unrelated
> to text generation. Enabling it changes nothing and the 403 persists. The one
> to enable is `aiplatform.googleapis.com`, plain **Vertex AI API**. This
> happened on the first attempt here.

## What is affected

Only **AI reply drafting** — the button that composes a first reply from the
conversation and the desk's published knowledge articles. Nothing else uses the
model.

The desk is fully usable without it, which is why this check **never fails the
deploy**: turning a green deployment red over an optional feature would stop
real deploys for a reason that is not a real outage. It is reported honestly
instead, so it cannot quietly become permanent.

## Why there is no API key to set

Deliberate (ADR 0036). The runtime service account **is** the credential — the
app fetches a token from Cloud Run's metadata server at request time. There is
no key material anywhere in the repo, nothing to store, leak, or rotate. The
cost of that design is exactly this: access is an IAM grant, not a value you
paste into a secret.

So a 403 here is never "the key is wrong". It is one of two things, and the
health message names both because they look identical from outside:

1. `aiplatform.googleapis.com` is not enabled on the project, or
2. the runtime service account lacks `roles/aiplatform.user`.

## The two steps

### PowerShell

```powershell
$Project = "<your GCP project id>"
$Runtime = "olink-desk-runtime@$Project.iam.gserviceaccount.com"
```

Enable the API, then grant the role:

```powershell
gcloud services enable aiplatform.googleapis.com --project $Project
gcloud projects add-iam-policy-binding $Project --member "serviceAccount:$Runtime" --role "roles/aiplatform.user"
```

### bash

```bash
PROJECT=<your GCP project id>
RUNTIME="olink-desk-runtime@${PROJECT}.iam.gserviceaccount.com"

gcloud services enable aiplatform.googleapis.com --project "$PROJECT"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:${RUNTIME}" \
  --role "roles/aiplatform.user"
```

## Verify

IAM changes propagate in under a minute, but the running revision caches its
access token until expiry, so **the check may keep failing for a few minutes on
a revision that started before the grant**. That is not a failed grant.

```powershell
$Url = gcloud run services describe olink-desk --region us-east1 --project $Project --format "value(status.url)"
(Invoke-RestMethod "$Url/api/health").checks.ai
```

`ok` means the model answered a real prompt — the check sends one and reads the
reply, rather than only confirming a variable is set. A configured-but-dead
backend is exactly the failure this check exists to catch, and it has happened
before in this fleet.

If it is still failing after five minutes, force a fresh revision:

```powershell
gcloud run services update olink-desk --region us-east1 --project $Project --update-env-vars "VERTEX_LOCATION=us-central1"
```

> `--update-env-vars` **merges**; `--set-env-vars` would wipe the rest of the
> environment and take `GOOGLE_CLOUD_PROJECT` with it. Same trap already
> recorded in `deploy.yml`.

## Region

The app is deployed in `us-east1` and calls Vertex in `us-central1`
(`VERTEX_LOCATION`, set by the deploy). Both are US regions — worth knowing
before an in-country hosting conversation, because moving the app to Ethio
Telecom ECS does not move the model, and that is a data-residency question to
answer deliberately rather than discover.
