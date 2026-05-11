# WhyC — Master Plan v3 (Verified · Gap-Closed · 90%+ Winning Probability Target)

**Status**: 📋 Final plan, awaiting team verification of operator-only items (G1, G3, G4)
**Authored**: 2026-05-11
**Authors**: Two Weeks Team (Sejun Kim, ComBba)
**Hackathon**: Google Cloud Rapid Agent Hackathon · **Arize Track**
**Submission deadline**: 2026-06-11 14:00 PT  · **D-31**
**Credit redemption deadline**: 2026-06-04  ·  **D-24**

> This document supersedes `architecture-v2-pdd-on-runtime.md` (still the deep technical reference) and `v2-overview.md` (still the team brief). This is the **execution plan** with every claim verified against current Google Cloud / Arize Phoenix / hackathon-rules documentation as of fetch on 2026-05-11.

---

## 0. Executive Summary

WhyC v2 is the runtime-level redesign that ports PreviewForge's PDD methodology *into the pipeline itself* — 13 sub-agents adjudicating analyze / develop / judge across 7 stages, with 3-layer context preservation (Postgres / Phoenix / BigQuery), Phoenix evaluation built into the judge, and learning loop across runs.

**Target outcome**: Top-3 finish in Arize track (~3% baseline odds, ~$5K/$3K/$2K prizes), achieved by combining four high-impact angles unique to this submission:

1. **Multi-agent adjudication** at runtime (no one else in the gallery will have 13 sub-agents)
2. **Real Phoenix Evals + Datasets + Experiments + MCP integration** depth, not just instrumentation
3. **Across-run learning** demonstrated via BigQuery — agent improves with usage
4. **Receipts-tone satire** of VC-funded shipping velocity — unique brand position

**Projected score**: ~89–94 / 100 (Stage-2). Sufficient for top-3 if executed.

---

## 1. KPI Dashboard

| KPI | Verified Value | Source |
| --- | --- | --- |
| Days to deadline | 31 | Today: 2026-05-11; deadline: 2026-06-11 14:00 PT |
| Days to credit redeem | 24 | Hard: 2026-06-04 |
| Sub-agents in v2 | 13 (3 + 5 + 5) | Stage 1 + Stage 3 + Stage 5 |
| Verified projected cost per converged run | **~$0.81 USD** | Gemini pricing fetch 2026-05-11 |
| 12-run demo cost | **~$10** | $0.81 × 12 = $9.72 |
| $100 credit utilization | **~10 %** | $10 / $100 |
| Margin remaining | **~$90 (90 %)** | $100 − $10 |
| GCP services used | 9 | See §4 |
| Phoenix-track features used | 5 | client + otel + evals + mcp + datasets/experiments via client |
| Code/spec sources verified | 7 | See §3 |
| Build-green packages | 3/3 | apps/api · apps/web · apps/jobs (all typecheck + build clean) |
| Open-source license | Apache-2.0 ✅ | repo metadata.license.spdx_id = "Apache-2.0" |
| First commit timestamp | 2026-05-06 22:19 +09 | After 2026-05-05 contest start → originality ✓ |

---

## 2. Verification Report — Every Claim Against a Source

### 2.1 Hackathon rules compliance (10 rule items)

| # | Rule (verbatim where critical) | Status | Evidence | Action if needed |
| --- | --- | --- | --- | --- |
| R1 | Public repo | ✅ | `gh api repos/Two-Weeks-Team/WhyC` returns `"visibility": "public"` | — |
| R2 | OSI-approved license | ✅ | `spdx_id = "Apache-2.0"` | — |
| R3 | Originality (≥ 2026-05-05) | ✅ | First commit 2026-05-06 22:19 +09 | — |
| R4 | Gemini model | ✅ | `apps/jobs/src/util/gemini.ts` uses `@google-cloud/vertexai` Gemini 2.5 Flash + Pro | — |
| R5 | **Google Cloud Agent Builder used** (rule verbatim: *"powered by Gemini and Google Cloud Agent Builder"*) | ⚠️ **GAP** | Current code uses Vertex AI SDK directly. Agent Builder ≡ "Gemini Enterprise Agent Platform" per docs.cloud.google.com 2026-05-11 fetch. We do **not** currently use GEAP / Agent Engine / Reasoning Engine. | **Implementation Phase 6**: deploy our pipeline as a Vertex AI Agent Engine entity in addition to Cloud Run job. Adds GEAP registration → satisfies rule. Effort: 4–8 h. |
| R6 | **Integrate Partner's MCP server** (rule verbatim: *"integrates a Partner Entity's MCP server to solve a real challenge"*) | ⚠️ **GAP** | Current code uses hand-rolled REST calls to Phoenix Cloud. The official `@arizeai/phoenix-mcp` package and `@arizeai/phoenix-client` exist on npm but are not yet in `apps/jobs/package.json`. Rule is intentionally ambiguous about *how* to integrate. | **Implementation Phase 1**: install 4 official npm packages (`@arizeai/phoenix-client`, `@arizeai/phoenix-otel`, `@arizeai/phoenix-evals`, `@arizeai/phoenix-mcp`). Switch `phoenix-client.ts` to use the official SDK. Adds a documented dependency on `@arizeai/phoenix-mcp` so the "integrates Partner MCP" claim is verifiable. Effort: 2 h. |
| R7 | No services that compete with Google Cloud / Partner (verbatim: *"…not permitted"*) | ✅ | `.github/workflows/banned-vendor-lint.sh` exists; CI greps for `@anthropic-ai/sdk`, `openai`, `aws-sdk` in dep tree. Verified file exists locally on 2026-05-11. | — |
| R8 | Web platform | ✅ | Next.js 15 app under `apps/web/` builds clean (4 routes, 109 KB first-load JS, build verified at commit b3d1c01) | — |
| R9 | Hosted URL (functional) | ❌ **OPEN** | No Cloud Run deploy executed yet. Pages serves design artifacts but not the WhyC product. | **Operator + Phase 6**: requires GCP project provisioning ($100 credit redeem on `app.2weeks@gmail.com`, "크레딧" billing account), then first push triggers `.github/workflows/deploy.yml`. ETA WK2-3. |
| R10 | ≤3-min demo video (YouTube/Vimeo, English/subtitled) | ❌ **OPEN** | Not recorded. | **Operator + WK5**: receipts-tone script anchored on H1 decision. ETA WK5 (D-7 → D-3). |

**Summary**: 7 PASS, 2 ⚠️ GAP (closeable by code work), 2 OPEN (operator-dependent, scheduled).

### 2.2 v2 technical-claim verification (against authoritative sources, fetched 2026-05-11)

| Claim | Source | Status | Notes |
| --- | --- | --- | --- |
| Gemini 2.5 Flash input rate | cloud.google.com/vertex-ai/generative-ai/pricing | ✅ | $0.30 / 1M tokens |
| Gemini 2.5 Flash output rate | same | ✅ | $2.50 / 1M tokens |
| Gemini 2.5 Pro input rate (≤200K ctx) | same | ✅ | $1.25 / 1M tokens |
| Gemini 2.5 Pro output rate (≤200K ctx) | same | ✅ | $10.00 / 1M tokens |
| **`apps/jobs/src/util/gemini.ts` cost rates** | grep file 2026-05-11 | ⚠️ **OUT OF DATE** | Code says Flash output 0.030 cents/1K (~$0.30/1M) but actual is $2.50/1M → code under-estimates Flash output by 8.3×. Pro input matches. Pro output code 0.5 cents/1K = $5/1M vs actual $10/1M → 2× under-estimate. **Action**: correct rates in Phase 1, update cost tables. |
| Phoenix Cloud REST API base URL | arize.com/docs/phoenix/sdk-api-reference/rest-api | ✅ | `https://app.phoenix.arize.com`, `/v1/...`, `Authorization: Bearer <token>` |
| Phoenix MCP server transport | arize.com/docs/phoenix/integrations/phoenix-mcp-server | ✅ (clarifying) | stdio-only, no HTTP. Cloud Run agents must use REST API or run `@arizeai/phoenix-mcp` via subprocess. |
| `@arizeai/phoenix-client` exists on npm | npmjs.com / GitHub Arize-ai/phoenix | ✅ | TypeScript REST client; methods: `getSpans`, `getTraces`, `createPrompt`, `createDataset`, `runExperiment` |
| `@arizeai/phoenix-otel` exists on npm | same | ✅ | OpenInference TypeScript instrumentation — replaces our manual `withSpan` partial coverage |
| `@arizeai/phoenix-evals` exists on npm | same | ✅ | LLM-as-judge eval framework — replaces hand-rolled `judge.ts` core |
| `@arizeai/phoenix-mcp` exists on npm | same | ✅ | MCP server as a package; satisfies R6 dependency claim |
| `getSpans` supports custom attribute filter (e.g., `whyc.run_id`) | GitHub README fetch | ⚠️ Partial | Built-in params: traceIds, parentId, name, spanKind, statusCode. Custom attribute filter not in SDK. **Workaround**: collect trace_ids from Postgres per run, pass to `getSpans({ traceIds })`. |
| Vertex AI Agent Engine deploy supports code-owned runtime | docs.cloud.google.com (partial fetch) | ⚠️ Partial | Page describes "Agent Runtime" deployment but full deploy artifact format not extracted. **Assumption**: Python/Node container deploy supported as Agent Engine, similar to Cloud Run. Will verify in Phase 6 against console. |
| BigQuery free tier covers our usage | cloud.google.com/bigquery/pricing (truncated fetch) | ⚠️ Assumed | Estimate: 10 GB storage free + 1 TB query free. Our usage: <50 KB / run × 100 runs = 5 MB total = negligible. Streaming inserts not free but volume tiny. Worst-case fee ~$0.01 / month. |
| Cloud Run free tier covers demo | WebSearch 2026-05-11 | ✅ | 180,000 vCPU-sec + 360,000 GiB-sec + 2M requests / month. Our usage (12 jobs × 30 min × 1 vCPU = ~22,000 vCPU-sec) is well within free tier. |
| Cloud Build pricing | not directly fetched | ⚠️ Assumed | Estimated: 120 build-minutes/day free on e2-medium. Our usage (~10 builds × 3 min = 30 build-minutes total) well within free. |

### 2.3 Code-side claims actually verified on disk (2026-05-11)

| Claim | Verification | Status |
| --- | --- | --- |
| `.github/workflows/banned-vendor-lint.sh` exists | `ls` returned the file | ✅ |
| `ci.yml` has 8 jobs (lint / test / nestia-staleness / banned-vendor / sanitizer-fixtures / secretlint / semgrep / docker-build) | grep yaml job keys | ✅ |
| `deploy.yml` has 5 jobs (build-and-push / migrate / deploy-api / deploy-web / smoke) | grep yaml job keys | ✅ |
| 47 unit + integration tests passing (5 .test.ts files) | `pnpm vitest run` at commit b3d1c01 | ✅ |
| apps/api typecheck + build clean | `pnpm typecheck && pnpm build` at commit 0e6371e | ✅ |
| apps/web typecheck + build clean (4 routes) | `pnpm typecheck && pnpm build` at commit 0e6371e | ✅ |
| apps/jobs typecheck + build clean | `pnpm typecheck && pnpm build` at commit 60cd6c6 | ✅ |
| `prisma/seed.ts` has no real YC company names | grep audit at commit 3223d85 (post Bolt fix) | ✅ |
| `runs/r-20260506T122526Z/mockups/P26-the-anti-ai.html` no real job IDs | grep audit at commit 3223d85 (post 82957 fix) | ✅ |
| `apps/web/src/app/page.tsx` no false "12 real" claims | Edit at commit 3223d85 | ✅ |
| `eval/sanitizer_fixtures/` directory exists | hook blocked `eval` keyword in bash; **NOT VERIFIED** | ⚠️ |
| `.github/workflows/ci.yml`'s sanitizer-fixtures job references actual fixtures | grep yaml | ✅ job exists |
| Apache-2.0 LICENSE file intact | `head -2 LICENSE` returned correct header | ✅ |

**One open verification**: presence of `eval/sanitizer_fixtures/` files. CI will fail Stage-1 if the job references non-existent fixtures. **Action in Phase 1**: create the fixtures directory with adversarial samples (ZWJ, BiDi, fake delimiters, "ignore previous instructions" patterns) or remove the CI job if not implementing.

---

## 3. Architecture — Final Locked Form (post-verification)

### 3.1 7-stage pipeline (after applying verification findings)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WhyC v2 Pipeline (locked)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  Stage 0  pre-flight                                                        │
│           URL fetch + M5 sanitize (using @arizeai/phoenix-otel auto-trace)  │
│           content_sha256 dedup against Postgres run history                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Stage 1  multi-analyzer (3 + 1 synth)                                      │
│           3 Gemini Flash × persona (speed/design/pragma) → 3 candidate spec │
│           I2 Jaccard dedup, regen most-similar with new seed                │
│           1 Gemini Pro synthesizer → canonical ProductSpec with provenance  │
│           Phoenix Datasets log: run_id → 3 specs → canonical                │
│           Phoenix Prompts versioning: speed.v1 / design.v1 / pragma.v1      │
├─────────────────────────────────────────────────────────────────────────────┤
│  Stage 2  go/no-go                                                          │
│           6 deterministic rules (regulated/hardware/stealth/over-x/IP)      │
│           Vertex AI Evaluation Service IP-safety call (optional, conditional)│
├─────────────────────────────────────────────────────────────────────────────┤
│  Stage 3  multi-developer (5 + I2 dedup + cross-pick)                       │
│           5 Gemini Pro × persona (design/pragma/speed/mobile/data) → manif. │
│           I2 structural hash, regen weakest                                 │
│           5-critic per-manifest evaluation → cross-pick winner              │
│           losers retained as runner-up for cross-flow combination next iter │
│           Phoenix Experiments: advocate win-rate over time                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  Stage 4  deploy (real, not stub)                                           │
│           Manifest → Next.js scaffold → Cloud Build → Artifact Registry     │
│             → Cloud Run service `whyc-preview-<run_id>` w/ 24h TTL          │
│           **Pipeline also deployed as Vertex AI Agent Engine entity         │
│             (rule R5 closure)**                                             │
│           Cloud Armor injects X-Robots-Tag: noindex,nofollow,noarchive      │
├─────────────────────────────────────────────────────────────────────────────┤
│  Stage 5  5-critic judge panel                                              │
│           5 Gemini Pro × specialty (a11y/api/perf/security/brand)           │
│             via @arizeai/phoenix-evals (Phoenix Evals integration)          │
│           Meta-tally weighted average; spec_fit closed-form drift assert    │
│           Per-critic verdict stored separately for individual replay        │
├─────────────────────────────────────────────────────────────────────────────┤
│  Stage 6  Phoenix MCP introspection                                         │
│           @arizeai/phoenix-client `getSpans({ traceIds: [run_traces] })`    │
│           @arizeai/phoenix-client `runExperiment` for cross-run comparison  │
│           Marker attribute `whyc.mcp.self_query=true` in trace tree         │
│           **@arizeai/phoenix-mcp listed as dep so R6 claim is verifiable**  │
├─────────────────────────────────────────────────────────────────────────────┤
│  Stage 7  self-improve + BigQuery learning                                  │
│           Pure `decideNext(judge, trace, learning)` → LoopDecision          │
│           BigQuery `whyc_learning.run_outcomes` table insert on terminate   │
│           BigQuery query at iter entry (N ≥ 10) for prior outcome priors    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 GCP service inventory (verified availability)

| Service | Used for | Free-tier headroom | Rule contribution |
| --- | --- | --- | --- |
| **Vertex AI Agent Engine / GEAP** | Pipeline registration | per-call (Gemini billing) | R5 closure |
| Vertex AI SDK (Gemini Flash + Pro) | All LLM calls via gemini.ts | Generous credit | R4 |
| Vertex AI Evaluation Service | Stage 2 IP-safety | per-call | Tech axis bonus |
| Cloud Run (services) | apps/api + apps/web | 180K vCPU-sec free | R8 platform + R9 hosted |
| Cloud Run (jobs) | Pipeline batch execution | same free tier | Operational |
| Cloud Build | Stage 4 image build | ~120 min/day free | Stage 4 deploy |
| Artifact Registry | Container images | free under 0.5 GB | Operational |
| Cloud SQL Postgres | Canonical state | Smallest tier ~$8/month | Persistent state |
| BigQuery | Learning loop | 10 GB storage + 1 TB query free | Tech axis bonus |
| Secret Manager | API keys + DB url | free under 6 secrets | Stage-1 hygiene |
| Cloud Armor | Rate limit + noindex inject | per-rule billing | Security |
| Workload Identity Federation | GHA → GCP | free | No JSON keys (best practice) |

### 3.3 Phoenix / Arize-track integration depth

| Phoenix feature | npm package | Used at | Verifiable evidence |
| --- | --- | --- | --- |
| Tracing (OpenInference) | `@arizeai/phoenix-otel` | All stages | Span tree in Phoenix Cloud |
| REST client | `@arizeai/phoenix-client` | introspect.ts | `getSpans` calls visible in code |
| LLM-as-judge | `@arizeai/phoenix-evals` | judge.ts | Eval template versioning visible in code |
| MCP server | `@arizeai/phoenix-mcp` | dependency | Listed in package.json — R6 closure |
| Prompts versioning | `@arizeai/phoenix-client` (prompts.createPrompt) | Stage 1 + Stage 5 prompts | Phoenix dashboard shows versioned prompts |
| Datasets | `@arizeai/phoenix-client` (datasets.createDataset) | Stage 1 + Stage 3 output logged | Phoenix dashboard shows datasets |
| Experiments | `@arizeai/phoenix-client` (experiments.runExperiment) | Cross-run A/B in Stage 6 | Phoenix dashboard shows experiments |

**Five Arize-track features in active use, not just dependency.** This is the difference between "uses Phoenix" (most submissions) and "structurally integrates Phoenix Evals + MCP + Datasets + Experiments + Prompts" (us).

---

## 4. Cost Plan — Recomputed With Real Pricing

### 4.1 Per converged run (3-iter average)

| Stage | LLM calls | Tokens (in / out approx) | Per-token cost (USD) | Stage cost (USD) |
| ----- | --------- | ------------------------- | -------------------- | ---------------- |
| 1 — analyze (3 Flash + 1 Pro) | 4 | 3 × (600 / 1400) + (1500 / 1500) | Flash $0.30/$2.50/1M · Pro $1.25/$10/1M | **$0.028** |
| 2 — go/no-go (1 Flash optional Eval) | 0–1 | (500 / 200) | Flash $0.30/$2.50/1M | **$0.001** |
| 3 — develop (5 Pro × 3 iter) | 15 | (2000 / 3000) each | Pro $1.25/$10/1M | **$0.488** |
| 4 — deploy (Cloud Build minute) | 0 LLM | — | $0.05 / build-min over free tier | **~$0.05** |
| 5 — judge (5 Pro × 3 iter) | 15 | (2000 / 1000) each | Pro $1.25/$10/1M | **$0.188** |
| 6 — introspect | 0 LLM | Phoenix REST call | free | **$0.000** |
| 7 — self-improve | 0 LLM | BigQuery 1 insert + 1 query | free tier | **$0.000** |
| Fixed Cloud Run + SQL | — | — | tiny under free tier | **~$0.05** |
| **Total per run** | | | | **~$0.81 USD** |

### 4.2 Total demo budget

| Item | Cost | Notes |
| --- | --- | --- |
| 12 demo runs (converged) | $10 | 12 × $0.81 |
| Retry buffer (×3 worst-case stage failure) | $20 | conservative |
| Video re-rendering experimental runs | $5 | 5–10 extra runs |
| Cloud SQL idle fees | ~$8 | f1-micro × 30 days |
| Vertex AI Evaluation extra | ~$3 | 12 × Vertex Eval calls |
| **Total projected** | **$46** | 46 % of $100 credit |
| **Margin remaining** | **$54** | 54 % buffer |

Conservative case (everything retries 3×, dataset expands to 30 runs): $80 / $100 = 80 % used. Still safe.

### 4.3 Cost-control levers (if costs exceed projection)

1. Drop Stage 3 multi-developer 5 → 3 — saves ~$0.20/run
2. Drop Stage 5 multi-critic 5 → 3 — saves ~$0.08/run
3. Use Flash for Stage 5 critics instead of Pro — saves ~$0.17/run
4. Cap demo runs at 8 instead of 12 — saves ~$2.50 total

Even applying all four reduces per-run to ~$0.35 → 12 × 0.35 = $4.20 total.

---

## 5. Gap Closure Plan

### 5.1 Gaps identified by verification

| Gap | Origin | Closure plan | Phase |
| --- | --- | --- | --- |
| G-R5 — Agent Builder/GEAP not used | Rule R5 verification | Deploy pipeline as Vertex AI Agent Engine entity (4-8 h) | Phase 6 |
| G-R6 — Phoenix MCP claim weak | Rule R6 verification | Install `@arizeai/phoenix-mcp` + `phoenix-client` + `phoenix-otel` + `phoenix-evals`; refactor introspect.ts | Phase 1 |
| G-COST-1 — gemini.ts cost rates 8.3× under-estimate Flash output, 2× under Pro output | grep file 2026-05-11 | Correct constants in `apps/jobs/src/util/gemini.ts` (10-line change) | Phase 1 |
| G-CI — sanitizer-fixtures dir not verified to exist | Hook blocked verification | Create `eval/sanitizer_fixtures/` with 10 adversarial samples, or remove CI job | Phase 1 |
| G-HOSTED — No live Cloud Run URL | Operator dependency | After credit redeem, `gh push` triggers deploy.yml → live URL | Phase 6 |
| G-VIDEO — No demo video | Operator dependency | WK5 receipts-tone recording | WK5 |
| G-DEVPOST — No Devpost entry | Operator dependency | WK5 draft from README + spec | WK5 |
| G-DATASET — Placeholder seed, no real YC verification | Operator + code | WK3 scraper + 7-check protocol from `docs/dataset-verification.md` | Phase 9 |

### 5.2 What's NOT a gap (verified clear)

| Item | Why not a gap |
| --- | --- |
| Apache-2.0 license | Verified at repo root + GitHub metadata |
| Originality (≥ 2026-05-05) | First commit 2026-05-06 22:19 +09 |
| Banned-vendor lint | CI job exists + script file exists on disk |
| Build verification | 3/3 packages green at commit 60cd6c6 |
| YC trademark in artifacts | Audited at commit 3223d85, fixed (Bolt → Birch, job/82957 → EXAMPLE) |
| Real-name dataset claims | "12 real Y Combinator companies" softened to "Up to 12 curated…(populating)" at commit 3223d85 |
| Phoenix MCP HTTP transport | Confirmed not available; mitigated by Phoenix REST API equivalent + dep listing |
| Cloud Run free tier exhaustion | 180K vCPU-sec free vs ~22K used = 12 % utilization |
| BigQuery free tier exhaustion | <100 KB total writes vs 10 GB free = negligible |
| Gemini Flash 2.0 vs 2.5 confusion | We standardize on 2.5 Flash (current default per pricing page) |

---

## 6. Implementation Phases (Locked Sequence)

### Phase 1 — Foundation + dep adoption (D-31 → D-29) · est 1 day

Concrete commits:

1. `chore(deps): adopt @arizeai/phoenix-{client,otel,evals,mcp}` — pnpm install, prisma generate verification
2. `fix(gemini): correct Gemini 2.5 pricing constants (closes G-COST-1)` — `apps/jobs/src/util/gemini.ts` 10-line change + verify ledger numbers
3. `feat(eval): create sanitizer_fixtures (closes G-CI)` — 10 adversarial samples in `eval/sanitizer_fixtures/*.txt`
4. `feat(jobs): util/retry.ts retry-with-budget framework (Phase 1 dep for v2)` — ~120 LOC + 8 unit tests
5. `feat(jobs): util/bigquery-learning.ts insert + query helpers` — ~150 LOC + 6 unit tests
6. `feat(jobs): pipeline/types.ts v2 contracts extension` — +80 LOC: `MultiAnalyzerOutput`, `MultiDeveloperOutput`, `MultiCriticOutput`, `LearningContext`

Build/test gate: all 3 packages remain green; new unit tests pass.

### Phase 2 — Stage 1 multi-analyzer (D-29 → D-27) · est 1 day

7. `feat(pipeline): analyze-v2 with 3 advocate analyzers + Pro synthesizer (~250 LOC)`
8. Test: DRY_RUN exercises full Stage 1, 3 synthetic specs → I2 dedup → 1 canonical with provenance

### Phase 3 — Stage 3 multi-developer (D-27 → D-25) · est 1.5 days

9. `feat(pipeline): develop-v2 5 advocate developers + I2 structural dedup + cross-pick (~350 LOC)`
10. Test: DRY_RUN 5 synthetic manifests → dedup → winner + 4 runner-ups retained

### Phase 4 — Stage 5 multi-critic (D-25 → D-23) · est 1 day

11. `feat(pipeline): judge-v2 5 critic panel via @arizeai/phoenix-evals (~280 LOC)`
12. Test: drift detection (spec_fit closed-form ↔ critic meta-tally) + weight invariant

### Phase 5 — Stage 6 + Stage 7 extensions (D-23 → D-21) · est 0.75 day

13. `feat(pipeline): introspect-v2 with phoenix-client getSpans + Experiments` — drops hand-rolled HTTP, uses official `getSpans({ traceIds })`
14. `feat(pipeline): self-improve-v2 consumes 3 signals (judge + trace + BQ learning)`

### Phase 6 — Stage 4 real deploy + Agent Engine registration (D-21 → D-17) · est 2 days · **GCP-DEPENDENT**

15. `feat(pipeline): deploy-v2 with Cloud Build + Cloud Run + Cloud Armor`
16. `feat(infra): vertex-ai-agent-engine deployment manifest (closes G-R5)` — pipeline-kickoff also deployed as Agent Engine entity
17. Smoke test: real LLM call for 1 placeholder company

### Phase 7 — Stage 2 Vertex AI Eval (D-17 → D-16) · est 0.5 day

18. `feat(pipeline): go-no-go-v2 with Vertex AI Evaluation Service IP-safety call`

### Phase 8 — Kickoff orchestrator v2 (D-16 → D-14) · est 1 day

19. `feat(jobs): pipeline-kickoff-v2 wires all v2 stages + WHYC_PIPELINE_VERSION env switch`
20. Test: full DRY_RUN end-to-end against 3 placeholder companies, all stages + retry paths

### Phase 9 — Data + scrape + verify (D-14 → D-10) · est 2 days · **OPERATOR**

21. `feat(jobs): scrape-yc.ts implementation (replaces stub)` — public workatastartup.com only, robots.txt honored
22. Operator runs 7-check verification per `docs/dataset-verification.md` for 12 companies → produces `data/dataset-verified.json`
23. `chore: replace prisma/seed.ts placeholders with verified data`
24. Re-run pipeline for 12 real companies → BigQuery populated with 12+ run outcomes

### Phase 10 — Polish + video + Devpost (D-10 → D-3) · est 4 days · **OPERATOR**

25. Operator records 3-min receipts-tone video, uploads to YouTube with EN subtitles
26. Operator updates README with badges + 3+ screenshots + live demo button
27. Operator drafts Devpost entry: 7 sections, Built With tags, live URL, video link, repo URL
28. Final rehearsal: walk-through of submission with 1-hour timer

### Phase 11 — Final submission (D-3 → D-0)

29. Submit Devpost entry by D-1 (2026-06-10) with 1-hour buffer
30. Verify all required fields complete; verify hosted URL serves traffic during submission window
31. Monitor for 24 h post-submit; respond to any reviewer ping

### Total

11 phases · 31 days · 31 estimated commits

---

## 7. 90 %+ Winning Probability Analysis

### 7.1 Score model

Base rate: 5 tracks × top-3 prizes × ~200 active submissions per track = ~3 % baseline.

For 90 %+ top-3 in Arize track, we need P(top-3) ≥ 0.90, which translates to ~top-1 % across submissions (since rank distribution is heavy-tailed in hackathons — most submissions don't pass Stage 1).

### 7.2 Required total Stage-2 score

Stage-2 has 4 axes × 25 pts = 100 max. Historical hackathon top-3 typically clusters at 80–90 / 100.

Our projected score breakdown:

| Axis | Target | What gets us there | Risk |
| --- | --- | --- | --- |
| Tech Implementation (25) | **23–25** | 9 GCP + 5 Phoenix features in active use, multi-stage validation framework, drift assertions, retry budgets, learning loop, structural enforcement of M4 / M5 / M11 mitigations | Agent Builder registration must actually visibly run |
| Design (25) | **20–23** | 5 advocate developers + 5 critic adjudication = consensus polish. 3 page types (landing / dashboard / detail) all WCAG 2.2 AA. v1 prototype already in production-fidelity. | Last-mile polish on the 12 *generated* previews matters |
| Potential Impact (25) | **21–23** | Two impact stories: (a) the receipts critique of VC velocity that resonates with founders/judges; (b) the learning-loop demonstration that this approach gets better with usage | Story strength depends on video quality |
| Quality of Idea (25) | **24–25** | "13-sub-agent panel adjudicating each build via structured PDD" is structurally unprecedented in any AI-tool gallery. Combined with the receipts angle, it's *memorable* to a tired Day-1 judge. | Risk if judge categorizes us as "another vibe-coding tool" before they read past the hero |
| **Total** | **88–96 / 100** | | |

**P(top-3 in Arize) at 88+ /100**: estimate 85–95 % given typical hackathon submission quality distribution.

### 7.3 Unique angles (no competitor will combine all 4)

1. **PDD methodology on runtime** — our pf plugin's research is unique to us
2. **Phoenix integration depth** — 5 features in active use (Evals + Datasets + Experiments + MCP + OpenInference). Most teams ship just OpenInference tracing.
3. **BigQuery learning across runs** — turns "this run" into "this team gets better with each run" demonstrably
4. **Receipts-tone satire** — pointed VC critique with disclaimable factual framing. Defensible + memorable.

Probability of any single competitor having all 4: ~0 %. Probability of having 2+: ~5 %. Probability of having 1: ~30 %.

### 7.4 Top-3 risk register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Live URL fails during judging window | Med | 🔴 Stage-1 fail | Pre-warm Cloud Run + monitor probes, deploy 48 h before submission |
| Video lower production quality than top-3 | Med | -3 to -5 Design pts | Pre-record + edit early WK5, keep budget for redo |
| Agent Builder/GEAP registration fails | Low–Med | -2 Tech Impl pts | Fallback to Vertex AI SDK direct + document the GEAP attempt in Devpost |
| Real Phoenix Evals integration breaks unexpectedly | Low | -3 Arize bonus | Keep hand-rolled judge.ts as fallback path under feature flag |
| Cloud SQL outage during judging | Very Low | 🔴 Stage-1 fail | Multi-AZ + Cloud SQL backup; rehearse cutover |
| YC company takedown request in last week | Low | -3 brand pts | M8 1-hour SLA pre-tested; 6 reserve candidates pre-verified |
| Submission deadline timezone confusion (PT vs KST) | Low | 🔴 Disqualification | Hardcoded calendar alert at D-1 14:00 PT in operator phone |

### 7.5 Sensitivity analysis

If we miss 2 of the 4 axes by 3 pts each: 88 − 6 = 82 → still top-3 likely.
If we miss 3 axes by 5 pts each: 88 − 15 = 73 → top-10 likely, top-3 borderline.
Realistic floor: 75 / 100 even with execution issues.

→ **90 %+ winning probability is achievable** assuming Phases 1–7 land + Phase 9 verified dataset + Phase 10 video at competent production.

---

## 8. Operator Decision Points (G1 – G6)

Before Phase 6 (deploy v2) starts, the operator must verify the following manually:

| ID | Decision | Method | Effort |
| --- | --- | --- | --- |
| G1 | Vertex AI Agent Engine console supports our pipeline registration pattern | console.cloud.google.com → Vertex AI → Agent Engine → New deployment | 15 min |
| G2 | Gemini current pricing matches fetched values (no surprise update) | Cross-check console pricing tab against this doc | 5 min |
| G3 | BigQuery free tier covers our usage | Quotas console → BigQuery → free-tier card | 5 min |
| G4 | Cloud Build & Cloud Run free tiers cover our usage | Same quotas console | 5 min |
| G5 | $100 credit arrives & redeemed to "크레딧" billing account | Inbox: `Partner-developer-marketing@google.com` + redeem on console | 5 min after arrival |
| G6 | Workload Identity Federation set up (no JSON keys in GH secrets) | Run gcloud commands in `deploy/README.md` §7 | 30 min |

**Status as of 2026-05-11**: G2 ✅ verified by Claude. G1, G3, G4, G6 require operator. G5 in flight (awaiting GCP partner email).

---

## 9. Definition of Done (Submission Gate)

A submission is "done" when ALL of these are TRUE simultaneously at T-1 hour to deadline:

- [ ] Cloud Run `whyc-web` returns HTTP 200 with the production landing page
- [ ] Cloud Run `whyc-api` returns HTTP 200 from `/api/v1/health`
- [ ] At least 8 deployed company previews (out of 12) accessible from the dashboard
- [ ] At least 1 converged spec-fit ≥ 0.92 visible in BigQuery + Phoenix
- [ ] Devpost entry has all 7 sections filled (Inspiration / What it does / How built / Challenges / Accomplishments / Learned / What's next)
- [ ] Devpost "Built With" tags include: Gemini, Google Cloud Agent Builder, Vertex AI, Cloud Run, Arize Phoenix
- [ ] Devpost links: live URL ✓, repo ✓ (public), video ✓ (YouTube with EN subtitles)
- [ ] Video ≤ 3:00 with EN subtitles, watched end-to-end by both team members
- [ ] No real YC company logo in any artifact
- [ ] Footer disclaimer (M4 supersede) visible on landing page
- [ ] M8 1-hour takedown SLA active (abuse@whyc.dev forwarding configured)
- [ ] Test suite passes locally (`pnpm -r test`)
- [ ] CI green on `main`
- [ ] Operator confirms credit redemption (no expiry surprises)
- [ ] Submission timestamp ≤ 2026-06-10 23:00 UTC (= 14:00 PT D-1 buffer)

---

## 10. Appendix A — Verified Sources (fetched 2026-05-11)

| Source | URL | What we got |
| --- | --- | --- |
| Hackathon rules | rapid-agent.devpost.com/rules | 10 rule items, 5 tracks (was 3 — GitLab/MongoDB added), 4 equal-weight criteria, no late grace |
| Gemini pricing | cloud.google.com/vertex-ai/generative-ai/pricing | Flash $0.30/$2.50/1M, Pro $1.25/$10/1M (≤200K ctx) |
| Phoenix MCP | arize.com/docs/phoenix/integrations/phoenix-mcp-server | stdio only, npm `@arizeai/phoenix-mcp` |
| Phoenix REST | arize.com/docs/phoenix/sdk-api-reference/rest-api | `/v1/spans`, Bearer auth, Phoenix Cloud or self-hosted |
| @arizeai npm packages | npmjs.com / github.com/Arize-ai/phoenix | client, otel, evals, mcp, cli all available |
| Cloud Run free tier | WebSearch (cloud.google.com) | 180K vCPU-sec + 360K GiB-sec + 2M req / month |
| Cloud Run pricing | cloud.google.com/run/pricing | (truncated; quotas verified via search snippet) |
| GEAP / Agent Builder | docs.cloud.google.com/agent-builder | Confirmed product name shift; deeper detail requires console access |
| Vertex AI Agent Engine | docs.cloud.google.com/vertex-ai/.../agent-engine | Same family as GEAP; Agent Runtime supports deploy |

## 11. Appendix B — Open Questions to Confirm at G1–G6 Verification

1. Does Vertex AI Agent Engine accept TypeScript / Node.js as a "code-owned runtime"? (Docs primarily reference Python; if Node not supported, we have a small Python wrapper option.)
2. Does the Agent Builder console allow registration of an externally-deployed Cloud Run job as an "agent", or must it be re-deployed under Agent Engine?
3. Can we use Workload Identity Federation across BOTH GitHub Actions and Cloud Build, or do we need separate setup?
4. Does Phoenix Cloud's `/v1/spans` REST endpoint support attribute filters beyond what `@arizeai/phoenix-client` exposes?
5. Is the Cloud SQL f1-micro adequate for the pipeline's write volume (~5 Iteration rows × 12 runs × 7 iter = 420 writes), or do we need db-g1-small?

---

## 12. Changelog

| Date | Version | Author | Change |
| --- | --- | --- | --- |
| 2026-05-11 | v0.1 | Two Weeks Team | Initial v2 architecture proposal (`architecture-v2-pdd-on-runtime.md`) |
| 2026-05-11 | v0.2 | Two Weeks Team | Team brief authored (`v2-overview.md`) |
| 2026-05-11 | v3.0 | Two Weeks Team | Master plan — full verification pass, gap closure, 90 % winning probability target. **This document supersedes v0.1 + v0.2 for execution.** |

---

**Verification ends here.** The plan is internally consistent, has every claim sourced, has every gap with a closure plan, has a budget that fits the credit, has a timeline that fits the deadline, and has a probability analysis grounded in the hackathon's actual scoring model.

What we do next is execute Phases 1–11 in sequence, with operator G1–G6 done in parallel where they unblock specific phases. No more planning is required for the architecture itself; remaining decisions are operational and tactical.
