# WhyC SpecDD — CHANGELOG v0 → v1

Source of truth for critic-round resolution. Every BLOCKING + HIGH finding from
`runs/r-20260506T122526Z/specs/critics/_feedback-v1.md` is enumerated below.
MEDIUMs are resolved when related to a blocker or trivially fixable; otherwise
explicitly deferred. LOWs are listed in `SPEC.md "Deferred to v2 follow-up"`.

---

## Tally

| Severity | Total | Resolved | Deferred (with reason) |
|---|---|---|---|
| BLOCKING | 11 | **11** | 0 |
| HIGH | 25 | **25** | 0 |
| MEDIUM | 21 | **20** | 1 |
| LOW | 11 | **11 listed** (deferred per instructions) | — |

---

## Cross-finding contradictions flagged

The instruction file called out four contradictions and gave reconciliation
guidance. We applied them as follows:

1. **SC2 H-D1 (`/v1/` prefix) vs SC2 H-D3 (iterations first-class).**
   Resolution: prefix everything `/api/v1/`, then *additionally* expose
   `/api/v1/iterations/{iter_id}` as a first-class resource alongside the
   nested `/api/v1/runs/{run_id}/iterations`. Both addressed.
2. **SC3 H-E1 (remove 503 from audit) vs SC6 B9 (no live Phoenix on audit).**
   Resolution: audit endpoint is a pure DB read (B9). 503 retained ONLY on
   `/api/v1/health` and `/api/v1/stats`. Documented in both endpoint
   descriptions and §8.1 error catalog.
3. **SC4 H-I1 (`currency_code` field) vs SC2 H-D2 (reusable `Page` schema).**
   Resolution: independent — applied both.
4. **SC1 a11y (description.{text,language}) vs SC7 (description_source_url
   enforcement).** Resolution: structured the description as a single nested
   `CompanyDescription` object with `required: [text, source_url, language]`;
   the OpenAPI required-list and the Postgres CHECK constraint are belt-and-
   suspenders.

---

## BLOCKING (11/11 resolved)

### B1. (SC1) Spec-fit numbers lack SR-determinable label — **resolved**
- Added `SpecFitState` enum `[converged, near, below_floor, pending, n_a]` in
  `openapi.yaml#/components/schemas/SpecFitState`.
- Added `spec_fit_state` field on `RunSummary`, `Iteration`, `JudgeVerdict`.
- Mirrored Prisma enum `SpecFitState` and `Run.finalSpecFitState`,
  `Iteration.specFitState`, `JudgeVerdict.specFitState`.
- Canonical aria-label template documented in the schema description: e.g.
  `"Spec-fit 87 percent, near convergence threshold of 92 percent"`.

### B2. (SC1) Receipts ledger numerics lack unit/SR phrasing metadata — **resolved**
- Added per-field SR phrasing in `PublicStats.median_run_cost_cents`,
  `median_ship_time_seconds`, and `RunSummary.total_cost_cents` descriptions
  (e.g. *"render as `<X> dollars and <Y> cents`, never `$0.04`"*).
- Added `PublicStats.unit` object with explicit SI annotations
  (`seconds`, `usd_cents`).

### B3. (SC3) Problem schema lacks `code` extension — **resolved**
- Added required `Problem.code` with pattern `^[a-z]+(\.[a-z_]+)+$`.
- Closed-vocabulary catalog in SPEC.md §8.1 (15 rows).

### B4. (SC3) 410 Gone missing on takedown chain — **resolved**
- Added `'410': { $ref: '#/components/responses/Gone' }` to:
  `/companies/{slug}`, `/companies/{slug}/runs`, `/runs/{run_id}`,
  `/runs/{run_id}/iterations`, `/iterations/{iter_id}`,
  `/iterations/{iter_id}/audit`, `/comments`.
- `Gone` response defines two example codes:
  `company.takedown_removed` and `deploy.expired`.
- Catalog row added in SPEC.md §8.1.

### B5. (SC5) ETag without 304/If-None-Match contract — **resolved**
- Added `IfNoneMatch` parameter ref to every cacheable GET.
- Added `'304': { $ref: '#/components/responses/NotModified' }` everywhere.
- ETag derivation strategy documented in info.description with three rules:
  content-hash for terminal/immutable; `(id, max_meaningful_updated_at)` for
  single non-terminal entities; `(filter_hash, max_updated_at, total_bucket)`
  for collections. **Explicitly excludes `last_hires_check_at`** to prevent
  6h-cron-driven cache invalidation.

### B6. (SC5) `pipeline_kickoff` lacks idempotency key — **resolved**
- Added `Run.kickoffKey String @unique @map("kickoff_key")`.
- Documented format `${companyId}:${kickoffBatchId}` in Prisma comment + §9.
- Documented single-tx kickoff (INSERT Run + UPDATE Company.currentRunId +
  UPDATE Company.status) in §9.
- Added partial-unique migration note: `CREATE UNIQUE INDEX
  runs_one_inflight_per_company ON runs (company_id) WHERE status IN
  ('pending', 'running')` — Prisma can't declare filtered uniques natively;
  raw migration committed.
- Exposed `kickoff_key` read-only on `Run` schema for traceability.

### B7. (SC6) Dashboard `/companies` N+1 on `current_run` — **resolved**
- Added explicit performance contract in `/companies` description: server
  MUST resolve `current_run` via single LEFT JOIN; per-row queries forbidden.
- Documented integration test: `EXPLAIN ANALYZE` ≤2 logical queries
  regardless of row count.

### B8. (SC6) Sort columns unindexed; cursor encoding undefined — **resolved**
- Cursor encoding pinned: `base64url(JSON.stringify({k, id}))` with `id` as
  deterministic tiebreaker.
- Prisma indexes added: `Company @@index([hiresPostedCount, id])`,
  `@@index([name, id])`; `Run @@index([finalSpecFit, id])`,
  `@@index([totalCostCents, id])`.
- Sortable fields restricted via `pattern` on the `sort` query param;
  unknown fields → `400 request.invalid_sort` (catalog row added).

### B9. (SC6) Audit endpoint may issue live Phoenix Cloud calls — **resolved**
- `/iterations/{iter_id}/audit` description explicitly states "MUST be a
  single Postgres read of Iteration + JudgeVerdict; MUST NOT issue any
  outbound call to Phoenix Cloud at request time".
- `phoenix_console_url` constructed in-app from templated base URL +
  stored `trace_id`.
- `Cache-Control: public, max-age=300` and `ETag` set.
- 503 explicitly removed from audit endpoint per H-E1 reconciliation.
- Added `phoenix_health_probe` cron in §9 to keep `Health.phoenix_reachable`
  fresh without hitting Phoenix from `/health` itself.

### B10. (SC7) Deploy URL revocation is DB-flag-only — **resolved**
- Defense-in-depth documented in §10.3:
  1. Cloud Armor time-bound rule drops traffic when `now > deploy_expires_at`
     regardless of cron state.
  2. Cloud Run service IAM has time-bound principal binding.
  3. `sweep_expired_deploys` cron (cadence ≤5 min) is the third line.
- Added `Run.deployRevokedConfirmedAt` distinct from `deployRevokedAt`
  (Prisma + OpenAPI).
- Sweeper cadence reduced to ≤5 min (was 15 min in v0).
- Worst-case time-to-removal stated: "5 min cadence + ~30 s delete latency
  ≈ 6 min; Cloud Armor cuts traffic immediately at expiry".
- Sweeper retry policy + Cloud Monitoring alerting documented in §9.

### B11. (SC7) `description_text` ↔ `description_source_url` dependency unenforced — **resolved**
- Replaced flat `description_text`/`description_source_url` pair with a
  nested `CompanyDescription` object on `Company` schema (OpenAPI 3.1
  required-list does the structural enforcement).
- Postgres CHECK constraint documented in Prisma comment (raw migration):
  `CHECK (description_text IS NULL OR (description_source_url IS NOT NULL
  AND description_source_url ~ '^https?://'))`.
- Integration test referenced: `test/integration/company-description.test.ts`
  asserts no served Company has description without source_url.

---

## HIGH (25/25 resolved)

### From SC1 A11y

- **H-A1** Pronunciation/aria expansion on `Company.name` — **resolved**:
  added `name_pronunciation`, `name_aria_label`, `name_display_short` (all
  nullable). Mirrored in Prisma (`Company.namePronunciation` etc.).
- **H-A2** List envelope window metadata — **resolved**: `Page.window =
  {start_index, end_index, total_estimate?, has_prev, has_next}`.
- **H-A3** Sort echo in response — **resolved**: `Page.applied_sort` (with
  `field, direction, label, aria_description`) + `Page.available_sorts`.
- **H-A4** Language tag on user-visible text — **resolved**: introduced
  `LocalizedString { text, language }` and `CompanyDescription` schemas;
  applied to `Company.description`, `Comment.body`, `JudgePrompt.body`.
  Default language `"en"`. BCP-47 pattern enforced.

### From SC2 API-design

- **H-D1** URL versioning — **resolved**: prefixed every path with
  `/api/v1/`. Server entries updated. Documented in info.description.
- **H-D2** Reusable `Page` schema — **resolved**: defined `components.schemas.Page`;
  every list (`BatchList`, `CompanyList`, `RunList`, `IterationList`,
  `CommentList`) uses `allOf: [Page, { properties: { data: ... } }]`.
  `IterationList` additionally carries `count` (exact, since iter_limit ≤7).
- **H-D3** URL hierarchy: iterations first-class — **resolved**: added
  `GET /api/v1/iterations/{iter_id}` first-class endpoint (ids globally
  unique cuids); kept the nested listing for ergonomics.
- **H-D4** Cross-resource references — **resolved**: added `Links` schema
  (`self, run, company, audit, iterations, verdict`); applied as `links`
  field on `Company`, `CompanyListItem`, `Batch`, `RunSummary`, `Run`,
  `Iteration`, `IterationAudit`, `Comment`. Also added `company_slug`
  companion on `Comment`, `Iteration`, `RunSummary` for direct URL build
  without lookup.

### From SC3 Error-model

- **H-E1** 503 reconciliation — **resolved**: 503 retained ONLY on `/health`
  and `/stats`. Audit endpoint description explicitly states no Phoenix
  dependency. Catalog row in §8.1 limits 503 to `service.db_unavailable`.
- **H-E2** Error catalog table in SPEC.md §8.1 — **resolved**: 15-row table
  with status / code / title / when emitted / endpoints / retryable columns.
- **H-E3** `Retry-After` on `ServiceUnavailable` — **resolved**: added
  `Retry-After` header on both `ServiceUnavailable` and `TooManyRequests`
  responses.
- **H-E4** 4xx/5xx matrix completion — **resolved**: every endpoint now
  declares `default` (catch-all `application/problem+json`), `500`, and
  appropriate `400`/`404`/`410`/`429` per its semantics. 503 only where
  semantically correct (B9 reconciliation).

### From SC4 i18n

- **H-I1** Currency unit explicit — **resolved**: `currency_code: USD` (ISO
  4217) on `PublicStats`, `RunSummary`, `Iteration`. Prisma column
  `currencyCode` per money-bearing model. Migration anchor documented in
  SPEC.md §4 ("currency anchor"). All `*_cents` field descriptions
  tightened to reference `currency_code`.

### From SC5 idempotency

- **H-Y1** Iteration idx-assignment protocol — **resolved**: documented
  `SELECT … FOR UPDATE` on Run row (with `pg_advisory_xact_lock` as
  alternative) before INSERT in Prisma comment + OpenAPI Iteration.idx
  description. Added partial-unique migration on
  `(run_id, parent_iter_id, regen_flow)` to prevent duplicate regen.
- **H-Y2** Deploy expiry sweeper idempotency — **resolved**: documented
  `UPDATE … SET deploy_revoked_at = COALESCE(deploy_revoked_at, now())
  WHERE deploy_expires_at < now() AND deploy_revoked_at IS NULL` and
  `SELECT FOR UPDATE SKIP LOCKED` for concurrent sweepers (Prisma comment
  + §9 + §10.3).
- **H-Y3** Takedown CAS — **resolved**: added `Company.version BigInt
  @default(0)`. CAS pattern documented in Prisma comment + §10.5.
  `TakedownEvent` records `companyVersionBefore`/`companyVersionAfter` for
  forensics.

### From SC6 performance

- **H-P1** Sparkline payload — **resolved**: added `RunSummary.spec_fit_sparkline:
  number[]` (max 7 items, immutable after run completion, populated by
  pipeline writer).
- **H-P2** Per-endpoint Cache-Control matrix — **resolved**: matrix in
  info.description; per-endpoint `Cache-Control` header examples set
  inline.
- **H-P3** ETag derivation strategy — **resolved**: same as B5 (combined).
- **H-P4** Cloud Run runtime — **resolved**: added §2.1 with the full
  table (min-instances=1, max-instances=5, cpu=1, memory=512Mi,
  cpu-always-allocated=true, Prisma connection_limit=3 pool_timeout=10,
  Next.js gzip+brotli ≥1KB, cold-start budget p95 < 1.5s).

### From SC7 security

- **H-S1** Preview deploy ingress layer — **resolved**: §10.3 documents
  Cloud LB + Cloud Armor injecting `X-Robots-Tag: noindex, nofollow,
  noarchive` on every response and a synthesized `/robots.txt` independent
  of generated content + smoke test in deploy stage.
- **H-S2** Sanitizer as discrete pipeline stage — **resolved**: §10.1
  introduces `whyc.sanitize_input` stage with `SanitizedInput{body,
  source_url, content_sha256, strip_report}` schema; adversarial fixtures
  at `/eval/sanitizer_fixtures/`; CI wired via `scripts/test-sanitizer.sh`.
  Pipeline diagram in §3 also reflects the new stage.
- **H-S3** Phoenix egress redaction — **resolved**: §10.2 documents
  OpenInference span processor with attribute filter that hashes/truncates
  `input.value`/`output.value` for `whyc.analyze` and `whyc.sanitize_input`
  spans (first 256 chars + sha256). PII regex strip pass.
- **H-S4** Rate limit / 429 — **resolved**: added `429` to every endpoint
  with `Retry-After` header. Cloud Armor rules (60/min companies+runs;
  600/min health+stats) documented in info.description and §10.4.
- **H-S5** HTTPS enforcement — **resolved**: §10.4 documents
  `https-only` Cloud Run ingress, HSTS `max-age=31536000; includeSubDomains`
  on whyc.example and preview domains, TLS 1.2 minimum.

---

## MEDIUM (20/21 resolved, 1 deferred)

### Resolved

- **SC1 (Iteration timeline lineage labels)** — `Iteration.parent_iter_id`
  description names the canonical UI string `"Regenerated from iteration
  <idx> on <regen_flow> flow"`.
- **SC1 (ISO 8601 Z + server_time anchor)** — top-level info.description
  pins UTC + Z; `Page.server_time`, `PublicStats.server_time`,
  `Health.server_time` added.
- **SC1 (Phoenix external link a11y warn)** — `IterationAudit.phoenix_console_url`
  description prescribes `rel="noopener noreferrer"` + "(opens in a new
  window)" SR announcement.
- **SC2 (slug pattern enforcement on params)** — `CompanySlug` parameter +
  `/comments` `company_slug` query both pinned to
  `^[a-z0-9][a-z0-9-]{0,63}$`.
- **SC2 (status code 304/429/406 documentation)** — `NotModified`,
  `TooManyRequests` responses defined; `406` added on
  `/judge/prompts/{version}` for representation negotiation.
- **SC2 (judge prompt versioning structure)** — moved `/judge/prompt/v1`
  → `/judge/prompts/{version}` with version path-param.
- **SC3 (`Problem.type` fallback)** — `default: "about:blank"` documented.
- **SC3 (`ceiling_hit`/`aborted` Warning header)** — `/runs/{run_id}` has
  `Warning: 299 - "run terminated without convergence"` documented.
- **SC3 (422 for invalid combos)** — `UnprocessableEntity` response added
  to `/companies` with `request.unprocessable` code.
- **SC4 (BigInt int64 annotations on monotonic counters)** — Prisma uses
  `BigInt` for `hiresPostedCount`, `iterLimit`, `costLimitCents`,
  `totalCostCents`, `costCents`, `version`, all PublicStatsSnapshot
  counters; OpenAPI uses `format: int64` consistently.
- **SC4 (en-source convention)** — `LocalizedString.language` defaults to
  `"en"`.
- **SC4 (judge_prompt language tag)** — `JudgePrompt.body` is a
  `LocalizedString`. `JudgePrompt.bodyLanguage` Prisma column added.
- **SC4 (slug normalization rule)** — documented on `CompanySlug`
  parameter description.
- **SC5 (Phoenix trace_id collision rule on regen)** — `Iteration.phoenix_trace_id`
  description states "pinned at iteration creation, never reused on regen";
  §6 step 5 reinforces.
- **SC5 (PublicStatsSnapshot daily uniqueness)** — Prisma comment
  documents `CREATE UNIQUE INDEX … ON ((generated_at::date))` migration +
  cron uses `ON CONFLICT DO UPDATE`.
- **SC6 (sparse fieldset / lean schema)** — added `CompanyListItem`
  schema for `/companies` to drop description / version / pronunciation
  extras.
- **SC6 (total_estimate optional/cached)** — `Page.total_estimate` is
  optional with cache-window caveat documented.
- **SC7 (CORS posture)** — info.description documents single-origin
  `Access-Control-Allow-Origin: https://whyc.example`, `GET, OPTIONS`
  only, no credentials, 1h preflight cache.
- **SC7 (logging exclusion of `description_text`)** — §10.2 explicitly
  excludes `description_text` from access log allow-list.
- **SC7 (banned-vendor lockfile lint)** — §10.6 adds lockfile-walking
  pass to the existing import grep.

### Deferred (1)

- **SC2 (sort comma-string → array)** — DEFERRED: kept comma-string for
  request-shape backwards compat with v0 fixtures. Rationale: v2 is the
  appropriate cut to switch to repeated `sort=` params; v1 already
  upgraded other URL semantics (versioning, judge prompt path), and
  changing the sort param shape on top adds churn without security or
  correctness benefit. Documented in SPEC.md "Deferred to v2 follow-up".

---

## LOW (11 — all listed in SPEC.md "Deferred to v2 follow-up")

Per the instruction file, LOWs are deferred with notes; full list mirrored
in `SPEC.md "Deferred to v2 follow-up"` section. Not repeated here.

---

## Files changed

| File | v0 → v1 delta |
|---|---|
| `openapi.yaml` | Rewritten. Versioned to `/api/v1`. New: `Page`, `Links`, `LocalizedString`, `CompanyDescription`, `SpecFitState`, `CompanyListItem`. Added `Problem.code`, 304/410/422/429/406/default everywhere applicable. New endpoint `/iterations/{iter_id}`. Renamed `/judge/prompt/v1` → `/judge/prompts/{version}`. ETag/If-None-Match contracts on all cacheable GETs. |
| `data-model.prisma` | Added `Company.namePronunciation/nameAriaLabel/nameDisplayShort/version/descriptionLanguage`; `Run.kickoffKey/finalSpecFitState/currencyCode/deployRevokedConfirmedAt`; `Iteration.specFitState/currencyCode`; `JudgeVerdict.specFitState`; `JudgePrompt.bodyLanguage`; `Comment.bodyLanguage`; `PublicStatsSnapshot.currencyCode`; `TakedownEvent.companyVersionBefore/After`; new enum `SpecFitState`. Migrated counters (`hiresPostedCount`, `iter_limit`, `cost_limit_cents`, `total_cost_cents`, `cost_cents`, `version`, all PublicStatsSnapshot fields) from `Int` to `BigInt`. Added composite indexes for B8 sortable cursor pagination. Documented raw-SQL migrations for partial-unique indexes (B6 in-flight, H-Y1 regen) and CHECK constraint (B11) and daily-unique on PublicStatsSnapshot (SC5 medium). |
| `SPEC.md` | New §2.1 (Cloud Run runtime budget); §3 pipeline table now includes `whyc.sanitize_input` stage; §4 currency anchor (H-I1); §6 step 5 trace-id rule + §6 step 6 ceiling_hit Warning; §7 lifecycle reflects new B6/B10/H-Y3 paths; new §8.1 error catalog (15 rows); §9 cron table revised (sweep cadence, idempotency contracts, phoenix_health_probe); §10 expanded with subsections 10.1–10.7 (sanitizer fixtures, Phoenix egress redaction, ingress layer + B10 defense-in-depth, rate limiting + HSTS, takedown CAS + 410, banned-vendor lockfile lint, secret hygiene); new "Deferred to v2 follow-up" section listing all LOW items + 1 deferred MEDIUM. |
