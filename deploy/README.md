# WhyC — Deploy Runbook

This directory contains every artifact needed to run WhyC on Google Cloud. It does NOT contain credentials. The operator (`Sejun Kim, centisgood@gmail.com`) provisions secrets via Secret Manager by hand — never via tooling.

---

## Architecture (production)

```
                                    ┌─ Cloud Armor ─┐
                       ┌────────────►  rate limits   ◄────────────┐
                       │            │  noindex hdr  │             │
                       │            └───────┬───────┘             │
                       │                    │                     │
              ┌────────┴──────────┐  ┌──────▼──────┐    ┌─────────┴─────────┐
              │ HTTPS LB          │  │ HTTPS LB    │    │  Cloud Run jobs   │
              │ whyc.example      │  │ api.whyc.…  │    │  (cron-triggered) │
              └────────┬──────────┘  └──────┬──────┘    └─────────┬─────────┘
                       │                    │                     │
                ┌──────▼──────┐      ┌──────▼──────┐               │
                │ whyc-web    │      │ whyc-api    │               │
                │ (Next.js)   │      │ (NestJS)    │               │
                │ Cloud Run   │      │ Cloud Run   │               │
                │ min=1 max=5 │      │ min=1 max=5 │               │
                └──────┬──────┘      └──────┬──────┘               │
                       │                    │                      │
                       └─────► API ◄────────┘                      │
                                            │                      │
                                            ▼                      │
                                     ┌──────────────┐    Gemini    ▼
                                     │ Cloud SQL    │    (managed identity)
                                     │ Postgres 16  │    Phoenix Cloud (egress)
                                     └──────────────┘
```

Two Cloud Run **services** (web + api) and five Cloud Run **jobs** (scrape, sweep-deploys, refresh-hires, public-stats-rebuild, pipeline-kickoff). All in one GCP project, one region.

---

## File map

| File | Purpose |
| ---- | ------- |
| `Dockerfile.api` | Multi-stage NestJS build for `whyc-api` |
| `Dockerfile.web` | Multi-stage Next.js standalone build for `whyc-web` |
| `docker-compose.yml` | Local-dev stack (postgres + api + web), reads `.env` at repo root |
| `.dockerignore` | Excludes runs/, node_modules, secrets from build context |
| `cloud-run/service-api.yaml` | Cloud Run service descriptor for `whyc-api` |
| `cloud-run/service-web.yaml` | Cloud Run service descriptor for `whyc-web` |
| `cloud-run/jobs/scrape-yc.yaml` | YC batch scraper (every 6h via Cloud Scheduler) |
| `cloud-run/jobs/sweep-deploys.yaml` | Expired preview revoker (every 5 min) |
| `cloud-run/jobs/refresh-hires.yaml` | Hire-count refresher (every 6h) |
| `cloud-run/jobs/public-stats-rebuild.yaml` | Nightly stats snapshot (`PublicStatsSnapshot`) |
| `cloud-run/jobs/pipeline-kickoff.yaml` | Manual: enqueue Companies → spawn Runs |
| `cloud-armor/policy.yaml` | Rate limit + `X-Robots-Tag` injection |

GitHub Actions workflows live in `.github/workflows/` at the repo root: `ci.yml`, `deploy.yml`, `banned-vendor-lint.sh`.

---

## Prerequisites — manual operator steps before first push

These cannot be automated; do them once.

### 1. GCP project + billing
```bash
gcloud projects create whyc-prod --name="WhyC Production"
gcloud billing projects link whyc-prod --billing-account=<YOUR_BILLING_ACCOUNT>
gcloud config set project whyc-prod
```

### 2. Enable APIs
```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  compute.googleapis.com
```

### 3. Hackathon $100 credit
Request via the Devpost portal. Approval window 1–5 business days. **Hard redeem deadline: 2026-06-04**.

**Status (2026-05-12): ✅ REDEEMED** onto billing account `크레딧계정` (`01B677-A6E5C9-B265AF`), under Google account `app.2weeks@gmail.com`.

---

## ✅ Provisioned state (2026-05-12)

The GCP project and the deploy plumbing are set up. Concrete resource names:

| Resource | Value |
| --- | --- |
| GCP project | `whyc-prod` (number `687675138316`) |
| Billing account | `크레딧계정` `01B677-A6E5C9-B265AF` (linked, billing enabled) |
| Region | `us-central1` · Artifact Registry repo `whyc` (docker) |
| Enabled APIs | run, cloudbuild, artifactregistry, aiplatform (Agent Platform), bigquery, secretmanager, sqladmin, iam, iamcredentials, sts |
| Deployer SA (GitHub Actions) | `gha-deployer@whyc-prod.iam.gserviceaccount.com` — roles: run.admin, cloudbuild.builds.editor, artifactregistry.admin, iam.serviceAccountUser, aiplatform.user, bigquery.dataEditor/jobUser, storage.admin, secretmanager.secretAccessor |
| Runtime SAs | `whyc-api-runtime@…` (cloudsql.client, secretAccessor, cloudtrace.agent) · `whyc-jobs-runtime@…` (+ aiplatform.user, run.admin, cloudbuild.builds.editor, artifactregistry.writer, storage.admin, bigquery.*) |
| Workload Identity Federation | pool `github` · provider `github-provider` (condition: `repository_owner == 'Two-Weeks-Team'`) · provider resource = `projects/687675138316/locations/global/workloadIdentityPools/github/providers/github-provider` · repo `Two-Weeks-Team/WhyC` bound to impersonate `gha-deployer` |
| GitHub repo secrets (set) | `GCP_PROJECT_ID=whyc-prod` · `GCP_WIF_PROVIDER=projects/687675138316/.../providers/github-provider` · `GCP_DEPLOYER_SA` and `GCP_SERVICE_ACCOUNT` = `gha-deployer@whyc-prod.iam.gserviceaccount.com` |
| BigQuery | dataset `whyc_learning` (US) · table `run_outcomes` (run_id, company_slug, outcome, final_spec_fit, iterations, cost_cents, most_regenerated_flow, terminated_at) — backs the self-improve learning signal |
| Cloud SQL | instance `whyc-pg` (POSTGRES_16, ENTERPRISE edition, `db-f1-micro`, us-central1, 10GB SSD, no backup) — see §4 / §6 below; password in Secret Manager |

### G-check status (master-plan-v4 §14)
- **G1** Vertex AI Agent Engine — ✅ `aiplatform.googleapis.com` enabled (shows as "Agent Platform API"); Vertex AI endpoint reachable. The "Reasoning Engine"/Agent Engine deployment itself is done via the Vertex AI SDK/REST in Phase 6 #12 (this gcloud build doesn't have the `gcloud ai reasoning-engines` subcommand, but the API works).
- **G2** Gemini pricing — ✅ (Claude-side verified; `gemini.ts` constants corrected).
- **G3** BigQuery free tier — ✅ dataset created; ~5 KB/run × ~100 runs ≪ 10 GB storage / 1 TB query free tier.
- **G4** Cloud Run + Build free tier — ✅ APIs enabled; ~12 short-lived preview deploys ≪ 180K vCPU-s + 360K GiB-s + 2M req/mo (Run) and 120 build-min/day (Build) free tiers.
- **G5** $100 credit on `크레딧` — ✅ redeemed.
- **G6** Workload Identity Federation — ✅ pool/provider/SA/binding created; GitHub secrets set (no long-lived JSON keys).
- **G7** `node:20-slim` has bash/python3/jq/shasum — ⚠️ **partial**: `node:20-slim` (debian bookworm-slim) ships `bash` + `sha256sum` but **not** `python3`, `jq`, or `shasum`. The v4 hooks use `python3` (for JSON parsing) and the `on-*` hooks ARE python3 scripts; the `.sh` hooks already fall back `shasum`→`sha256sum`. ⇒ the Cloud Run **jobs** image (the one running `pipeline-kickoff-v2`) needs a Dockerfile that does `apt-get install -y python3` (jq optional — not used). There is no `deploy/Dockerfile.jobs` yet; create one in Phase 6/8. (The `api`/`web` images don't run hooks, so they're unaffected.)

**Operational facts (PIN)**: Google account `app.2weeks@gmail.com` · billing `크레딧계정` `01B677-A6E5C9-B265AF` · project `whyc-prod` · Devpost username `centisgood`.

### 4. Cloud SQL (Postgres 16)
```bash
gcloud sql instances create whyc-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --storage-size=10GB \
  --storage-auto-increase \
  --backup-start-time=04:00 \
  --enable-bin-log

gcloud sql databases create whyc --instance=whyc-db
gcloud sql users create whyc --instance=whyc-db --password=$(openssl rand -base64 32)
```

Save the password to Secret Manager (step 6).

### 5. Artifact Registry
```bash
gcloud artifacts repositories create whyc \
  --repository-format=docker \
  --location=us-central1
```

### 6. Secret Manager — populate by hand

```
whyc-database-url             → postgres://whyc:<pwd>@…?schema=public&connection_limit=3
whyc-database-url-writer      → same, separate user with write privs
whyc-gemini-api-key           → from Vertex AI / AI Studio
whyc-arize-phoenix-api-key    → from app.phoenix.arize.com
whyc-arize-phoenix-endpoint   → https://app.phoenix.arize.com/v1/traces
whyc-cors-allowed-origin      → https://whyc.example
whyc-judge-prompt-version     → v1
```

```bash
echo -n "<value>" | gcloud secrets create whyc-<name> --data-file=-
```

Rotate Phoenix key every 90 days. Document rotation in operator log.

### 7. Workload Identity Federation (for GitHub Actions)

```bash
gcloud iam workload-identity-pools create github \
  --location=global --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global --workload-identity-pool=github \
  --display-name="GitHub OIDC" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

gcloud iam service-accounts create gha-deployer \
  --display-name="GitHub Actions Deployer"

# bind repo → SA via workload identity
PROJECT_NUMBER=$(gcloud projects describe whyc-prod --format='value(projectNumber)')
gcloud iam service-accounts add-iam-policy-binding \
  gha-deployer@whyc-prod.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/Two-Weeks-Team/WhyC"

# minimal roles for deploy
gcloud projects add-iam-policy-binding whyc-prod \
  --member=serviceAccount:gha-deployer@whyc-prod.iam.gserviceaccount.com \
  --role=roles/run.developer
gcloud projects add-iam-policy-binding whyc-prod \
  --member=serviceAccount:gha-deployer@whyc-prod.iam.gserviceaccount.com \
  --role=roles/artifactregistry.writer
gcloud projects add-iam-policy-binding whyc-prod \
  --member=serviceAccount:gha-deployer@whyc-prod.iam.gserviceaccount.com \
  --role=roles/cloudsql.client
gcloud projects add-iam-policy-binding whyc-prod \
  --member=serviceAccount:gha-deployer@whyc-prod.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

Add to GitHub repo secrets: `GCP_PROJECT_ID=whyc-prod`, `GCP_WIF_PROVIDER=projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/providers/github-provider`, `GCP_SERVICE_ACCOUNT=gha-deployer@whyc-prod.iam.gserviceaccount.com`.

### 8. First deploy
Push `main` → `.github/workflows/deploy.yml` runs build + push + `gcloud run deploy` for both services + `prisma migrate deploy`. Smoke-test the URLs.

### 9. DNS (optional for hackathon judging)
Map `whyc.example` to `whyc-web` Cloud Run service via Cloud Run Domain Mapping. Until then, judges visit the `*.run.app` URL.

---

## Local development

```bash
# requires docker, pnpm 8+, node 20+
cp .env.example .env
# fill GEMINI_API_KEY locally; leave others at defaults

docker compose -f deploy/docker-compose.yml up -d postgres
pnpm install
pnpm db:setup          # prisma migrate dev + seed
pnpm dev               # both apps, hot reload
```

Open `http://localhost:3000` for web, `http://localhost:8080/api/v1/health` for API.

---

## Takedown procedure (M8 — 1h SLA)

1. Receive request at `abuse@whyc.dev` (alias forwarding to `centisgood@gmail.com`).
2. Verify identity claim is plausible.
3. Apply takedown:
   ```bash
   pnpm script:takedown --slug=<company-slug> --reason="<text>"
   ```
   Script flips `Company.takedownState = 'removed'`, appends `TakedownEvent`, and triggers immediate `sweep-deploys` job which revokes the Cloud Run preview within 5 min.
4. Confirm via `/api/v1/companies/<slug>` returning `410 Gone` + `code: company.takedown_removed`.
5. Cloud Logging filter-and-purge for the affected `slug` (cleans up to 30-day retention).
6. Reply to requester with confirmation and timestamp.

Worst-case time-to-removal: 5 min sweeper cadence + Cloud Run revision delete latency (~30s) = 6 min.

---

## Rollback

```bash
gcloud run services update-traffic whyc-api --to-revisions=whyc-api-<previous-revision>=100 --region=us-central1
gcloud run services update-traffic whyc-web --to-revisions=whyc-web-<previous-revision>=100 --region=us-central1
```

Cloud Run keeps the last 5 revisions live; rolling back is constant time. Database migrations are forward-only — schema rollback requires manual SQL via `prisma migrate resolve`.

---

## Cost ceiling

Per H1 lock + SPEC §10:
- Cloud Run `max-instances=5` per service → upper-bound spend on a flood
- Cloud Armor 60 req/min/IP for read-heavy paths → DDoS-tolerant
- Phoenix Cloud free tier 50k traces/month → M14 sampling guardrail
- Total target: under the $100 GCP credit for the duration of the hackathon, with ≥30% remaining for the demo + judging window

Watch via `gcloud billing accounts get-iam-policy` weekly.
