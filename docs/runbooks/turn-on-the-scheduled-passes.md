# Turn on the scheduled passes (escalation and retention)

**Status: NOT DONE in production.** Both passes are deployed and neither can
run. This runbook is the fix, and it needs a `gcloud` session against the
project — no agent sandbox has one.

## What is wrong

Two routes are driven by a schedule:

| Route | What it does when it runs | What happens today |
|---|---|---|
| `POST /api/cron/escalate` | Raises a notification when an SLA promise is about to be broken | 403 |
| `POST /api/cron/retention` | Erases ticket content and audit rows past the workspace's retention window | 403 |

Both verify `CRON_SECRET` with a constant-time compare and **fail closed on an
unset secret** — deliberately, because the alternative ("no secret configured,
so allow it") turns a deploy mistake into an open endpoint that anyone can
hammer, and it fails in the direction where nobody finds out.

`CRON_SECRET` is in `.env.example`. It is **not** in the deploy workflow's
`--set-secrets` list, so the Cloud Run revision has never had it. Consequences,
both silent:

- **Escalation has never fired in production.** A promise missed at 2am is
  still missed silently. The wallboard and the ticket rail derive breach live
  at read time, so nothing is *wrong* — nobody is told.
- **A retention window would be a promise nothing keeps.** An administrator can
  set one today and no data will ever be erased.

The second is the one that matters commercially: a tenant told "we delete after
365 days" while nothing deletes is a compliance statement that is false.

## How you can tell

`GET /api/health` reports `cronSecret: "ok" | "unset"` (presence only — the
value is never echoed). The Settings → Data lifecycle panel also shows a banner
when no schedule is configured, but only an admin already inside a workspace
sees that; health is what an operator and the deploy pipeline read.

## Windows / PowerShell

The commands below are bash. If you are working from PowerShell, use
`turn-on-the-scheduled-passes-powershell.md` instead — it is the same five
steps, but two of them fail in ways that are hard to see on Windows (a UTF-8
BOM written into the secret, and an empty-string argument PowerShell drops),
and that file works around both.

## Fix, in order

The order matters: **step 3 will break every deploy if steps 1–2 have not been
done**, because `gcloud run deploy --set-secrets` fails when a named secret does
not exist.

### 1. Create the secret

```bash
PROJECT=<your project id>
openssl rand -hex 32 | gcloud secrets create olink-desk-cron-secret \
  --project "$PROJECT" --data-file=-
```

### 2. Let the runtime service account read it

```bash
gcloud secrets add-iam-policy-binding olink-desk-cron-secret \
  --project "$PROJECT" \
  --member "serviceAccount:olink-desk-runtime@${PROJECT}.iam.gserviceaccount.com" \
  --role roles/secretmanager.secretAccessor
```

### 3. Add it to the deploy

In `.github/workflows/deploy.yml`, append to the `--set-secrets` value:

```
,CRON_SECRET=olink-desk-cron-secret:latest
```

Note it is one comma-separated string — `--set-secrets` REPLACES the whole set,
so the existing four entries must stay.

Merge, let the deploy run, and confirm `GET /api/health` now reports
`cronSecret: "ok"`.

### 4. Schedule the two jobs

```bash
REGION=us-east1
URL="$(gcloud run services describe olink-desk --region "$REGION" \
  --project "$PROJECT" --format 'value(status.url)')"
SECRET="$(gcloud secrets versions access latest \
  --secret=olink-desk-cron-secret --project "$PROJECT")"

# Escalation: often enough that an alarm is useful, rarely enough that it is
# not a load source. The pass is idempotent — the unique (ticketId, kind)
# constraint means a repeat cannot re-tell a supervisor the same thing.
gcloud scheduler jobs create http olink-desk-escalate \
  --project "$PROJECT" --location "$REGION" \
  --schedule "*/15 * * * *" --time-zone "Africa/Addis_Ababa" \
  --uri "$URL/api/cron/escalate" --http-method POST \
  --headers "X-Cron-Secret=$SECRET" --message-body ""

# Retention: nightly, outside business hours. Idempotent and bounded per
# tenant, so a backlog drains over successive nights rather than in one pass.
gcloud scheduler jobs create http olink-desk-retention \
  --project "$PROJECT" --location "$REGION" \
  --schedule "20 2 * * *" --time-zone "Africa/Addis_Ababa" \
  --uri "$URL/api/cron/retention" --http-method POST \
  --headers "X-Cron-Secret=$SECRET" --message-body ""
```

### 5. Prove each one actually ran

Scheduler reporting "success" only means it got a 2xx. Force one of each and
read the body:

```bash
gcloud scheduler jobs run olink-desk-escalate  --project "$PROJECT" --location "$REGION"
gcloud scheduler jobs run olink-desk-retention --project "$PROJECT" --location "$REGION"
```

Then check the Cloud Run logs for the response. Retention answers with a
per-tenant breakdown:

```json
{"ok":true,"scannedOrganizations":1,
 "tenants":[{"organizationId":"…","ticketsProcessed":12,"ticketsRemaining":0,
             "messagesRedacted":31,"attachmentsRedacted":4,"auditRowsDeleted":0}]}
```

`scannedOrganizations: 0` is the expected and correct answer while no workspace
has set a window — it means the pass ran and had nothing to do, which is
different from it not running.

## Do not

- **Do not make the cron routes accept an unset secret.** The fail-closed
  behaviour is the security property; an "allow when unconfigured" fallback is
  an open endpoint that deletes data.
- **Do not run the retention job for the first time against a tenant you care
  about without checking its window.** Erasure is irreversible, and the whole
  point of `ticketsRemaining` in the response is to make a first pass legible
  before the second one.
