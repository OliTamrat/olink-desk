# Runbook — GCP staging setup (one-time, founder-side)

Creates the dedicated `olink-desk` GCP project on the existing Olink billing
account and wires the deploy-on-green pipeline (ADR 0004). After this, every
CI-green push to `main` deploys itself; nothing below ever repeats.

Run in a terminal with `gcloud` logged in as the account that owns the
Bank Assist project. Pick the billing account id with
`gcloud billing accounts list`.

```bash
# ---- 1. Project on the existing billing account -------------------------
PROJECT=olink-desk            # append a suffix if the id is taken, e.g. olink-desk-prod
BILLING=XXXXXX-XXXXXX-XXXXXX  # from: gcloud billing accounts list
gcloud projects create "$PROJECT" --name="Olink Desk"
gcloud billing projects link "$PROJECT" --billing-account="$BILLING"
gcloud config set project "$PROJECT"

gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com cloudbuild.googleapis.com

# ---- 2. Artifact Registry for the image --------------------------------
gcloud artifacts repositories create olink-desk \
  --repository-format=docker --location=us-east1

# ---- 3. Service accounts: deployer (CI) and runtime (the service) ------
# Split from day one — the Bank Assist tradeoff we chose not to repeat.
gcloud iam service-accounts create olink-desk-deployer --display-name="CI deployer"
gcloud iam service-accounts create olink-desk-runtime  --display-name="Cloud Run runtime"

for ROLE in roles/run.admin roles/artifactregistry.writer roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:olink-desk-deployer@$PROJECT.iam.gserviceaccount.com" \
    --role="$ROLE"
done
# Deployer must be allowed to run the service AS the runtime identity:
gcloud iam service-accounts add-iam-policy-binding \
  "olink-desk-runtime@$PROJECT.iam.gserviceaccount.com" \
  --member="serviceAccount:olink-desk-deployer@$PROJECT.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountUser
# Runtime needs only the secrets:
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:olink-desk-runtime@$PROJECT.iam.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor

# ---- 4. Secrets ---------------------------------------------------------
# DATABASE_URL: create a free Supabase project (or any Postgres) and paste
# its DIRECT (port 5432) connection string. printf '%s' avoids the trailing
# newline that has broken this fleet twice.
printf '%s' 'postgresql://USER:PASSWORD@HOST:5432/postgres' | \
  gcloud secrets create olink-desk-database-url --data-file=-

openssl rand -hex 32   | tr -d '\n' | gcloud secrets create olink-desk-jwt-secret --data-file=-
openssl rand -base64 32| tr -d '\n' | gcloud secrets create olink-desk-channel-config-key --data-file=-
openssl rand -hex 24   | tr -d '\n' | gcloud secrets create olink-desk-admin-secret --data-file=-

# ---- 5. GitHub secrets --------------------------------------------------
gcloud iam service-accounts keys create /tmp/olink-desk-deployer.json \
  --iam-account="olink-desk-deployer@$PROJECT.iam.gserviceaccount.com"
# In github.com/OliTamrat/olink-desk → Settings → Secrets and variables →
# Actions, add:
#   GCP_SA_KEY      = contents of /tmp/olink-desk-deployer.json
#   GCP_PROJECT_ID  = the $PROJECT value
rm /tmp/olink-desk-deployer.json

# ---- 6. First deploy ----------------------------------------------------
# Actions tab → Deploy → Run workflow. It builds, migrates, deploys, and
# prints the service URL. That URL is the staging desk.
```

## Notes

- Until step 5 is done, the Deploy workflow **skips cleanly** on every push —
  no red X, no partial state.
- The pipeline deliberately mirrors Bank Assist: two GitHub secrets only;
  `--update-env-vars` (merge) for `APP_BASE_URL`, never `--set-env-vars`;
  deploys queue rather than cancel.
- Rotating any app secret: `gcloud secrets versions add <name> --data-file=-`
  then redeploy (Actions → Deploy → Run workflow).
