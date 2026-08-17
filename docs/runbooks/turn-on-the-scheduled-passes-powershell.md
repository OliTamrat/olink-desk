# Turn on the scheduled passes — PowerShell

The Windows path through `turn-on-the-scheduled-passes.md`. Read that file for
*why* this is needed; this one is how to do it from PowerShell without hitting
the two traps that make it fail silently on Windows.

Works in **Windows PowerShell 5.1 and PowerShell 7+**. Every command is a
single line on purpose — PowerShell's line continuation is a backtick, and a
single trailing space after it breaks the command in a way that reads as a
gcloud error.

## The two Windows-specific traps

**1. Never pipe a secret into `gcloud secrets create`.**

```powershell
# WRONG — do not do this
"my-secret" | gcloud secrets create olink-desk-cron-secret --data-file=-
```

PowerShell's pipeline and `Out-File`/`Set-Content` write a **UTF-8 BOM** and a
trailing CRLF. The BOM is not whitespace, survives a trim, and becomes part of
the secret value. The result: `gcloud` succeeds, the secret looks right in the
console, and every request the scheduler makes is rejected — because the
comparison is byte-for-byte against a value with three invisible bytes on the
front. This exact failure cost a day in Olink Bank Assist.

Step 1 below writes the file with `[System.IO.File]::WriteAllText` and an
explicit BOM-less encoder, which is the only reliable way.

**2. `--message-body ""` is unreliable from PowerShell.** An empty-string
argument is sometimes dropped before `gcloud` sees it. Step 4 passes `"{}"`
instead — safe here because **neither cron route reads the request body**; both
authenticate on the `X-Cron-Secret` header alone.

## Before you start

Set these once per shell. Everything below reuses them.

```powershell
$Project = "<your GCP project id>"
$Region  = "us-east1"
$Service = "olink-desk"
$Runtime = "olink-desk-runtime@$Project.iam.gserviceaccount.com"
```

> `"$Project.iam..."` expands correctly — PowerShell stops simple variable
> expansion at the dot, so this is the variable followed by literal text, not a
> property access. It only becomes property access with `$($Project.iam)`.

Check you are pointed at the right project before changing anything:

```powershell
gcloud config set project $Project
gcloud auth list
```

---

## 1. Create the secret

Generate 32 random bytes as hex. **Hex specifically** — the value is later
interpolated into a double-quoted PowerShell string, and hex contains no `$`
or backtick, so nothing in it can be eaten by the parser.

```powershell
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$CronSecret = [System.BitConverter]::ToString($bytes).Replace('-','').ToLower()
$CronSecret.Length    # must print 64
```

Write it to a temp file with **no BOM and no trailing newline**, create the
secret from that file, then delete it:

```powershell
$tmp = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tmp, $CronSecret, (New-Object System.Text.UTF8Encoding $false))
gcloud secrets create olink-desk-cron-secret --project $Project --replication-policy=automatic --data-file=$tmp
Remove-Item $tmp -Force
```

**Verify what actually got stored** — this is the step that catches the BOM:

```powershell
$stored = gcloud secrets versions access latest --secret=olink-desk-cron-secret --project $Project
$stored.Length          # must print 64, not 65 or 67
$stored -eq $CronSecret # must print True
```

If either check fails, delete and redo rather than patching:

```powershell
gcloud secrets delete olink-desk-cron-secret --project $Project --quiet
```

## 2. Let the runtime service account read it

```powershell
gcloud secrets add-iam-policy-binding olink-desk-cron-secret --project $Project --member "serviceAccount:$Runtime" --role roles/secretmanager.secretAccessor
```

Confirm the binding exists:

```powershell
gcloud secrets get-iam-policy olink-desk-cron-secret --project $Project
```

## 3. Add it to the deploy

This is a repo change, not a gcloud one. In `.github/workflows/deploy.yml`,
append to the **existing** `--set-secrets` value:

```
,CRON_SECRET=olink-desk-cron-secret:latest
```

`--set-secrets` **replaces the whole set**, so the four existing entries must
stay in the same comma-separated string. Getting this wrong drops
`DATABASE_URL` and the revision fails to start.

Do not do this before steps 1 and 2 — `gcloud run deploy --set-secrets` fails
on a secret that does not exist, and it would break every deploy until fixed.

Push, let the deploy run, then:

```powershell
$Url = gcloud run services describe $Service --region $Region --project $Project --format "value(status.url)"
(Invoke-RestMethod "$Url/api/health").checks
```

`cronSecret` must now read `ok`. Until this deploy lands, steps 4 and 5 will
get 403 — which is correct, not a mistake you made.

## 4. Schedule the two jobs

```powershell
$Url = gcloud run services describe $Service --region $Region --project $Project --format "value(status.url)"
$CronSecret = gcloud secrets versions access latest --secret=olink-desk-cron-secret --project $Project
```

If Cloud Scheduler has never been used on this project, enable it first — the
job creation fails with a permission-shaped error otherwise, which reads as an
IAM problem rather than a missing API:

```powershell
gcloud services enable cloudscheduler.googleapis.com --project $Project
```

**Escalation** — often enough that an alarm is useful, rarely enough that it is
not a load source. The pass is idempotent: the unique `(ticketId, kind)`
constraint means a repeat cannot re-tell a supervisor the same thing.

```powershell
gcloud scheduler jobs create http olink-desk-escalate --project $Project --location $Region --schedule "*/15 * * * *" --time-zone "Africa/Addis_Ababa" --uri "$Url/api/cron/escalate" --http-method POST --headers "X-Cron-Secret=$CronSecret" --message-body "{}"
```

**Retention** — nightly, outside business hours. Idempotent and bounded per
tenant, so a backlog drains over successive nights rather than in one pass.

```powershell
gcloud scheduler jobs create http olink-desk-retention --project $Project --location $Region --schedule "20 2 * * *" --time-zone "Africa/Addis_Ababa" --uri "$Url/api/cron/retention" --http-method POST --headers "X-Cron-Secret=$CronSecret" --message-body "{}"
```

## 5. Prove each one actually ran

Scheduler reporting "success" only means it received a 2xx. Force one of each
and read what came back:

```powershell
gcloud scheduler jobs run olink-desk-escalate  --project $Project --location $Region
gcloud scheduler jobs run olink-desk-retention --project $Project --location $Region
```

Then read the response out of the Cloud Run log:

```powershell
gcloud logging read "resource.labels.service_name=$Service AND httpRequest.requestUrl:cron" --project $Project --limit 10 --format "value(httpRequest.requestUrl, httpRequest.status)"
```

A `403` means the secret the scheduler is sending does not match the one the
revision has — go back to step 1's verification. A `200` is the pass running.

Retention answers with a per-tenant breakdown:

```json
{"ok":true,"scannedOrganizations":1,
 "tenants":[{"organizationId":"…","ticketsProcessed":12,"ticketsRemaining":0,
             "messagesRedacted":31,"attachmentsRedacted":4,"auditRowsDeleted":0}]}
```

`scannedOrganizations: 0` is the **expected and correct** answer while no
workspace has set a retention window. It means the pass ran and had nothing to
do — which is a different thing from the pass not running, and the reason this
number is in the response at all.

## Rolling back

Nothing here is destructive except the retention pass itself, and only against
a workspace that has set a window. To stop both passes without unpicking
anything:

```powershell
gcloud scheduler jobs pause olink-desk-escalate  --project $Project --location $Region
gcloud scheduler jobs pause olink-desk-retention --project $Project --location $Region
```

## Do not

- **Do not make the cron routes accept an unset secret.** The fail-closed
  behaviour is the security property; an "allow when unconfigured" fallback is
  an open endpoint that deletes data.
- **Do not run the retention job for the first time against a workspace you
  care about without checking its window first.** Erasure is irreversible.
