# SpecDD Round 1 — Critic Feedback for spec-author v2

7 critics reviewed v0 (`runs/r-20260506T122526Z/specs/{openapi.yaml,data-model.prisma,SPEC.md}`). Aggregate verdict: **needs_revision**. 11 blocking + 25 high + 21 medium + 11 low = 68 findings total.

This file is your input. Address every BLOCKING and every HIGH. Mediums in clusters where related to a blocker. Lows you may defer with a note in `SPEC.md` "Deferred to v2 follow-up" section.

---

## BLOCKING (11) — must-fix before SHA-256 lock

### B1. (SC1) Spec-fit numbers lack SR-determinable label
- Where: `RunSummary.final_spec_fit`, `Iteration.spec_fit`, `JudgeVerdict.score`
- Fix: Add `spec_fit_state: enum[converged|near|below_floor|pending|n_a]` alongside the float. Document canonical aria-label template in description: e.g. `"Spec-fit 87 percent, near convergence threshold of 92 percent"`.

### B2. (SC1) Receipts ledger numerics lack unit/SR phrasing metadata
- Where: `PublicStats.median_run_cost_cents`, `median_ship_time_seconds`
- Fix: For each numeric receipts field, document canonical SR-friendly phrasing in OpenAPI description (e.g. "Render as `<X> dollars and <Y> cents` for screen readers, never as `$0.04`"). Add `unit` field on PublicStats schema.

### B3. (SC3) Problem schema lacks `code` extension
- Where: `components/schemas/Problem`
- Fix: Add `code: { type: string, pattern: '^[a-z]+(\\.[a-z_]+)+$', required: true }`. Define closed enum of values in the new SPEC.md §8.1 error catalog (see B4).

### B4. (SC3) 410 Gone missing on takedown chain (and SC1/SC7 alignment)
- Where: `/companies/{slug}/runs`, `/runs/{run_id}`, `/runs/{run_id}/iterations`, `/iterations/{iter_id}/audit`, `/comments`
- Fix: Add `'410': { $ref: '#/components/responses/Gone' }` to all listed paths. Define `Gone` response with codes `company.takedown_removed` and `deploy.expired`. Add SPEC.md §8.1 error catalog table per SC3-#4.

### B5. (SC5) ETag without 304/If-None-Match contract
- Where: every cacheable GET (`/stats`, `/batches`, `/batches/{id}`, `/companies`, `/companies/{slug}`, `/runs/{run_id}`, `/judge/prompt/v1`)
- Fix: On every GET emitting ETag, add `parameters: [{ in: header, name: If-None-Match, schema: { type: string } }]` and `'304': { description: Not Modified, headers: { ETag, Cache-Control } }`. Document ETag derivation strategy in top-level description (content-hash for terminal-state runs and judge prompt; `(resource_id, max(meaningful_updated_at))` for collections — *exclude* `last_hires_check_at` from the hash).

### B6. (SC5) `pipeline_kickoff` lacks idempotency key
- Where: `Run` Prisma model + SPEC.md §9
- Fix: Add `kickoffKey String @unique @map("kickoff_key")` to Run. Document in §9 that pipeline_kickoff is idempotent on `kickoffKey = ${companyId}:${kickoffBatchId}` and a duplicate is a no-op returning existing Run.id. Wrap kickoff in single transaction (INSERT Run + UPDATE Company.currentRunId + UPDATE Company.status). Add partial-unique index `Run @@unique([companyId])` filtered to `status IN (pending, running)` to enforce "one in-flight run per company".

### B7. (SC6) Dashboard `/companies` N+1 on `current_run`
- Where: `GET /companies` returning `RunSummary` per company
- Fix: Add explicit description: "Server MUST resolve current_run via single LEFT JOIN (Prisma `include: { currentRun: true }`); MUST NOT issue per-row run queries." Spec mandates an integration test: `EXPLAIN ANALYZE` shows ≤2 logical queries regardless of row count.

### B8. (SC6) Sort columns unindexed; cursor encoding undefined
- Where: `/companies` sort param
- Fix: (a) Specify cursor encoding: `base64({sort_key_value, id})` with `id` as deterministic tiebreaker. (b) Add Prisma `@@index([hiresPostedCount])` on Company; `@@index([finalSpecFit, id])` and `@@index([totalCostCents, id])` on Run. (c) Limit sortable fields to indexed columns; reject others with 400 `request.invalid_sort`.

### B9. (SC6) Audit endpoint may issue live Phoenix Cloud calls
- Where: `/iterations/{id}/audit`
- Fix: Add description: "Endpoint MUST be a single Postgres read of Iteration + JudgeVerdict; MUST NOT issue any outbound call to Phoenix Cloud. `phoenix_console_url` is constructed from a templated base URL + stored trace_id only." Add `Cache-Control: public, max-age=300` and ETag headers.

### B10. (SC7) Deploy URL revocation is DB-flag-only
- Where: `sweep_expired_deploys` cron + `Run.deployRevokedAt`
- Fix: (1) Defense-in-depth: Cloud Armor rule that drops traffic when `now > deploy_expires_at` regardless of cron state, OR Cloud Run service IAM with time-bound principal. (2) Add `deploy_revoked_confirmed_at` column distinct from `deployRevokedAt`. (3) Move sweeper cadence to ≤5 min. (4) Document worst-case time-to-removal as `cadence + delete_latency`. (5) Spec retry policy + alerting for sweeper failures.

### B11. (SC7) `description_text` ↔ `description_source_url` dependency unenforced (M4 violation)
- Where: `Company` Prisma + OpenAPI
- Fix: Add Prisma migration CHECK constraint `(descriptionText IS NULL) OR (descriptionSourceUrl IS NOT NULL AND descriptionSourceUrl ~ '^https?://')`. Mirror in OpenAPI using `dependentRequired` (3.1): `Company.description_text` requires `description_source_url`. Add integration test asserting every served Company with `description_text != null` has `description_source_url`.

---

## HIGH (25) — should-fix before lock

(grouped by critic; address all unless flagged)

### From SC1 A11y
- H-A1: `Company.name` needs pronunciation/aria expansion fields (`name_pronunciation`, `name_aria_label`, `name_display_short`)
- H-A2: List envelope window metadata (`window: {start_index, end_index, total_estimate, has_prev, has_next}`)
- H-A3: Sort echo in response: `applied_sort: [{field, direction, label, aria_description}]` + `available_sorts`
- H-A4: Language tag on user-visible text fields: split into `{text, language}` for `description`, `Comment.body`, judge prompt response (BCP-47, default "en")

### From SC2 API-design
- H-D1: URL versioning: prefix all paths with `/v1` (so `/api/v1/companies`, `/api/v1/judge/prompts/v1`). Document in info.description.
- H-D2: Reusable `Page` schema; all list types use `allOf` it. Fix `IterationList` to match (or document with `count` field).
- H-D3: URL hierarchy consistency: make iterations first-class (`GET /v1/iterations/{id}`) OR fully nest audit (`/runs/{run_id}/iterations/{iter_id}/audit`). Pick one.
- H-D4: Cross-resource references: add `links: {self, …}` object on every entity, OR include `company_slug` on Comment/Iteration so client can build URLs without lookups.

### From SC3 Error-model
- H-E1: 503 Phoenix-outage path — reconcile (audit endpoint is pure DB read per B9; remove Phoenix dependency from description; keep 503 only on `/health` + `/api/stats`)
- H-E2: Error catalog table in SPEC.md §8.1 with columns `status | code | title | when emitted | endpoints | retryable?` (10+ rows minimum, see SC3-#4 for the canonical list)
- H-E3: `Retry-After` header on `ServiceUnavailable` response (RFC 7231 §7.1.3)
- H-E4: 4xx/5xx matrix completion: 500 + 503 on every endpoint via `default` response; add 400 to all path-param endpoints

### From SC4 i18n
- H-I1: Currency unit explicit: add `currency_code: "USD"` (ISO 4217) constant on PublicStats and Run schemas. Tighten descriptions on all `*_cents` fields. Document migration anchor in SPEC.md §4.

### From SC5 idempotency
- H-Y1: Iteration idx-assignment protocol: document `SELECT … FOR UPDATE` on Run before INSERT-ing next Iteration, OR Postgres advisory lock keyed on run_id. Add `@@unique([runId, parentIterId, regenFlow])` partial-unique.
- H-Y2: Deploy expiry sweeper idempotency: spec must state `UPDATE runs SET deployRevokedAt = COALESCE(deployRevokedAt, now()) WHERE deployExpiresAt < now() AND deployRevokedAt IS NULL` and `SELECT FOR UPDATE SKIP LOCKED` for concurrent sweepers.
- H-Y3: Takedown CAS: add `version Int @default(0)` to Company. Optimistic concurrency on transitions: `UPDATE … WHERE id=? AND version=?`. Document rule in §10.

### From SC6 performance
- H-P1: Sparkline payload: add `spec_fit_sparkline: number[]` (max 7 points) to RunSummary; populated by pipeline writer; immutable after run completion.
- H-P2: Per-endpoint Cache-Control matrix: `/health` no-store; `/stats` `public, max-age=3600, stale-while-revalidate=86400`; `/judge/prompt/v1` `public, max-age=31536000, immutable`; `/runs/{id}` conditional (terminal=immutable, else 30s); `/companies`/`/comments` `max-age=60`.
- H-P3: ETag derivation strategy specified (see B5 — also covers this)
- H-P4: Cloud Run runtime: add SPEC.md §2.1 with `min-instances=1, max-instances=5, cpu=1, memory=512Mi, cpu-always-allocated=true` for whyc-web; Prisma `connection_limit=3&pool_timeout=10`; Next.js gzip+brotli ≥1KB; cold-start budget p95 < 1.5s.

### From SC7 security
- H-S1: Preview deploy ingress layer (Cloud Load Balancer or reverse-proxy) injects `X-Robots-Tag: noindex, nofollow, noarchive` on every response regardless of status. Synthesized `/robots.txt` independent of generated content. Smoke test in deploy stage.
- H-S2: Sanitizer encoded as discrete pipeline stage `whyc.sanitize_input` BEFORE `whyc.analyze`. Output `SanitizedInput{body, source_url, content_sha256, strip_report}`. Adversarial fixture set at `/eval/sanitizer_fixtures/`. Wire to CI.
- H-S3: Phoenix egress redaction: OpenInference span processor with attribute filter that hashes/truncates `input.value`/`output.value` for `whyc.analyze` and `whyc.sanitize_input` spans (first 256 chars + sha256). Strip PII regex matches before export.
- H-S4: Rate limit: add 429 to all GETs in OpenAPI. Cloud Armor 60 req/min/IP for `/api/companies*`/`/api/runs*`, 600 req/min/IP for `/api/health`/`/api/stats`. Cloud Run `max_instances=5` for whyc-web.
- H-S5: HTTPS enforcement: `https-only` Cloud Run ingress, HSTS `max-age=31536000; includeSubDomains` on whyc.example and whyc-preview-*; TLS 1.2 minimum.

---

## MEDIUM (21) — fix where related to a blocker, defer with note otherwise

Brief list (full text in critic outputs):
- SC1: Iteration timeline lineage labels; ISO 8601 Z + server_time anchor; Phoenix external link a11y warn
- SC2: Slug pattern enforcement on params; status code 304/429/406 documentation; sort comma-string→array; judge prompt versioning structure (`/judge/prompts/{version}`)
- SC3: `Problem.type` fallback to `about:blank`; ceiling_hit/aborted Warning header; 422 for invalid combos
- SC4: BigInt int64 annotations on monotonic counters; user-string i18n anchor (en-source convention); judge_prompt language tag (BCP-47); slug normalization rule
- SC5: Phoenix trace_id collision rule on regen; PublicStatsSnapshot daily uniqueness
- SC6: Sparse fieldset (`?fields=`) or `CompanyListItem` lean schema; total_estimate optional/cached
- SC7: CORS posture explicit; logging exclusion of description_text; banned-vendor lockfile lint

---

## LOW (11) — defer to v2 follow-up section in SPEC.md

Brief list:
- SC1: Sparkline tabular SR-equivalent
- SC2: total_estimate semantics doc; comments path nesting (`/companies/{slug}/comments`)
- SC3: English-first commitment doc; instance URI as trace correlation
- SC4: Datetime UTC convention pin; Accept-Language stub
- SC5: Judge prompt content-type ETag agreement (Vary: Accept)
- SC6: Comment slug→id round-trip
- SC7: IDOR-by-design doc; CSP for Next.js

---

## Output expectations for v2

Write to `/tmp/whyc-spec/` (overwriting v0):
- `openapi.yaml` — applies B1, B2, B3, B4, B5, B7, B8, B9, B11 + all H-*'s
- `data-model.prisma` — applies B6, B11 + H-Y1/H-Y2/H-Y3
- `SPEC.md` — applies B10 + adds §8.1 error catalog + §2.1 runtime + §10 expansion (sanitizer fixtures, Phoenix egress redaction, ingress layer, rate limiting, HSTS) + "Deferred to v2 follow-up" section listing the LOW items

Also produce `/tmp/whyc-spec/CHANGELOG-v1.md` listing every B/H/M item by id with a short note on resolution OR explicit deferral with reason.

If you encounter contradictions between findings, flag them in the changelog and pick a defensible interpretation.
