# WhyC Architecture v2 — PDD on Runtime

**Status**: 📋 Proposed (awaiting one more verification round before implementation)
**Authored**: 2026-05-11
**Authors**: Two Weeks Team (Sejun Kim, ComBba)
**Target deadline**: 2026-06-11 14:00 PT
**Track**: Arize (Google Cloud Rapid Agent Hackathon)

> This document captures the **agreed-on-principle** architecture for WhyC v2. The v1 architecture (`runs/r-20260506T122526Z/specs/SPEC.md`) and its v1 spec lock remain unchanged; v2 is a runtime-level redesign that ports PreviewForge's PDD methodology *into the pipeline itself*, not just into the design phase.

---

## 0. Why v2 — what v1 misses

WhyC v1 is a single-perspective LLM agent loop:

```
analyze(1 call) → go/no-go(rules) → develop(1 call) → deploy → judge(1 call) → improve
```

This is structurally identical to Bolt / Lovable / Replit Agent / v0.dev. **No technical differentiation.** Judges seeing v1 will categorize it as "another vibe-coding tool" and the Idea Quality (25 pts) collapses.

PDD's real value is in three signature patterns that v1 lacks:

| PDD signature | v1 has it? | What this buys |
| ------------- | ---------- | -------------- |
| N-advocate multi-perspective generation | ❌ | Diverse candidates per stage, not single LLM bias |
| I2 diversity validator + adjudication | ❌ | Forces meaningful difference between candidates |
| Mitigation step (dissent → action) | ❌ | Disagreement becomes the next iteration's instruction |

v2 ports all three into the runtime pipeline. WhyC then is no longer "an AI that builds an app" — it's "an agent panel that converges on a build via structured adjudication," which is genuinely unprecedented in the gallery.

---

## 1. The 7-stage v2 pipeline

Each stage is documented with (a) multi-perspective generation, (b) validation, (c) re-validation, (d) failure / retry / learning, (e) context preservation, (f) GCP / Phoenix feature used.

### Stage 0 — Pre-flight  (NEW)

| Aspect | Detail |
| ------ | ------ |
| Purpose | URL validation, JD body fetch, M5 sanitize, content-sha256 cache lookup |
| (a) Generation | Single fetch — no LLM call yet |
| (b) Validation | URL pattern allow-list, content_sha256 deduplication |
| (c) Re-validation | 24h after first ingest, automatic re-fetch (JD may have changed) |
| (d) Retry / failure | HTTP fetch 2× retry → permanent fail emits NoGo `source_unavailable` |
| (e) Context | `input_id = sha256(url + body)` is the canonical key referenced by every downstream stage |
| (f) GCP / Phoenix | Cloud Tasks queue, Cloud Logging |

### Stage 1 — Multi-Analyzer  (REVISED)

| Aspect | Detail |
| ------ | ------ |
| Purpose | Read public posting → ProductSpec (14-line product hypothesis) |
| (a) Generation | **3 advocate analyzers in parallel** (Gemini Flash, registered as Agent Builder sub-agents): `speed-obsessed`, `design-forward`, `pragmatist`. Plus a 4th **Synthesis Agent** (Gemini Pro) that merges the 3 outputs into one canonical ProductSpec. |
| (b) Validation | Zod schema per output; I2-style Jaccard on `(target_persona, primary_surface)` ≥ 0.7 triggers regen of the most-similar advocate |
| (c) Re-validation | Synthesis Agent re-checks consistency: are the 3 advocates within plausible interpretation bounds, or did one go off-spec? |
| (d) Retry / failure | parse-fail 2× retry per advocate (error feedback included in re-prompt); if 3 advocates all fail, single-advocate emergency mode |
| (e) Context | `ProductSpec._provenance = { field_name: advocate_id }` — downstream can audit *which advocate contributed which field* |
| (f) GCP / Phoenix | Agent Builder (sub-agents), Phoenix Prompts (advocate + synthesis prompts versioned), Phoenix Datasets (every analyze logged) |

### Stage 2 — Go / No-Go + Vertex AI Eval

| Aspect | Detail |
| ------ | ------ |
| Purpose | Decide whether WhyC can ship a credible preview |
| (a) Generation | 6 deterministic rules (regulated / hardware / stealth / over-complexity / over-budget / IP-safety) + one Vertex AI Evaluation call for IP-safety scoring |
| (b) Validation | Rule outputs are pure; eval score threshold checked against fixed cutoff |
| (c) Re-validation | Borderline scores (0.4 – 0.6) get a second-opinion call with a different model |
| (d) Retry / failure | Rules: N/A. Eval API timeout 1× retry. |
| (e) Context | NoGoDecision carries the firing rule + eval score |
| (f) GCP / Phoenix | Vertex AI Evaluation (GCP feature beyond the basic SDK) |

### Stage 3 — Multi-Developer + I2 Dedup  (BIGGEST CHANGE)

| Aspect | Detail |
| ------ | ------ |
| Purpose | Generate a Next.js scaffold manifest from the ProductSpec |
| (a) Generation | **5 advocate developers in parallel** (Gemini Pro, Agent Builder sub-agents): `design-forward`, `pragmatist`, `speed-obsessed`, `mobile-first`, `data-nerd`. Each produces an independent manifest. |
| (b) Validation | Zod schema per manifest + structural validation (every flow has ≥1 file, total tokens ≤ budget) |
| (c) Re-validation | I2 dedup: manifest structure-hash Jaccard > 0.7 → the weakest advocate regenerates with a different seed |
| (d) Retry / failure | Per-developer 2× retry; if 4+ fail, single-developer fallback with a flagged "degraded mode" attribute on the span |
| (e) Context | Winner manifest tagged with `chosen_advocate`; **losing manifests retained as runner-up candidates** so a future regen-iter can cross-combine (e.g. "this hero from design-forward, this dashboard from pragmatist") |
| (f) GCP / Phoenix | Agent Builder (5 sub-agents), Phoenix Experiments (advocate win-rate over time), Phoenix Datasets (manifest comparison) |

### Stage 4 — Deploy  (real, not v1 stub)

| Aspect | Detail |
| ------ | ------ |
| Purpose | Ship the winner manifest as a live Cloud Run preview |
| (a) Generation | Manifest → Next.js scaffold → Cloud Build → container → Artifact Registry → Cloud Run deploy |
| (b) Validation | Cloud Build status + Cloud Run health probe |
| (c) Re-validation | 5 min after deploy, auto re-probe (cold-start stability) |
| (d) Retry / failure | Cloud Build 2× retry; permanent fail → iteration marked failed |
| (e) Context | `deploy_url`, `build_id`, `image_sha`, `region`, `deploy_expires_at` (24h TTL per M6) |
| (f) GCP / Phoenix | Cloud Build, Cloud Run, Artifact Registry, Cloud Armor |

### Stage 5 — 5-Critic Judge Panel  (REVISED)

| Aspect | Detail |
| ------ | ------ |
| Purpose | Score the deployed preview against the canonical ProductSpec |
| (a) Generation | **5 specialist critics in parallel** (Gemini Pro): `critic-a11y`, `critic-api`, `critic-perf`, `critic-security`, `critic-brand`. Each scores all 4 axes; results meta-tallied with confidence intervals. |
| (b) Validation | Per-critic Zod schema; immutable weight invariant (.20/.20/.45/.15); meta-tally `spec_fit` must equal closed-form sum within 0.001 |
| (c) Re-validation | If spec_fit ≠ closed-form sum → StageError `judge.formula_mismatch` (hard fail, non-retriable) |
| (d) Retry / failure | Per-critic 1× retry; if 3+ critics fail, weighted re-normalization across available critics |
| (e) Context | Each critic's verdict stored separately; per-critic replay possible without re-running the whole panel |
| (f) GCP / Phoenix | Phoenix Evals (5 critic templates), Phoenix Prompts (versioned) |

### Stage 6 — Phoenix MCP Introspection  (EXTENDED)

| Aspect | Detail |
| ------ | ------ |
| Purpose | Agent reads its own trace data back via Phoenix MCP and compares to past converged runs |
| (a) Generation | MCP tool calls: `phoenix.get_trace(run_id)`, `phoenix.list_experiments(project)`, `phoenix.compare_evals(this, last_converged)` |
| (b) Validation | MCP response schema check + trace completeness (every stage left at least one span) |
| (c) Re-validation | Phoenix data vs Postgres state cross-check — divergence → alert |
| (d) Retry / failure | MCP call timeout 5s, 1× retry; non-fatal — falls back to judge-only signal |
| (e) Context | `TraceSummary.experiment_comparison` — quantitative position vs prior converged runs |
| (f) GCP / Phoenix | Phoenix MCP (Arize bonus criterion directly), OpenInference instrumentation |

### Stage 7 — Self-Improve + BigQuery Learning  (NEW LEARNING LAYER)

| Aspect | Detail |
| ------ | ------ |
| Purpose | Decide regen target or terminate, informed by judge + introspect + history |
| (a) Generation | Synthesizes 3 signal sources: judge meta-tally, Phoenix introspect, BigQuery learning query (`SELECT regen_choice FROM past_runs WHERE weakest_flow = ? AND outcome = 'converged'`) |
| (b) Validation | Decision struct schema; ceiling guards (iter ≤ 7, cost ≤ $5) |
| (c) Re-validation | N/A — pure function |
| (d) Retry / failure | BigQuery query failure → empirical-learning layer skipped, decision uses judge + introspect only |
| (e) Context | `decision.rationale = { from_judge, from_trace, from_learning }` — full provenance of the regen choice |
| (f) GCP / Phoenix | BigQuery (per-run insert + cross-run query), Cloud Tasks (next-iter scheduling) |

---

## 2. Cross-cutting concerns

### 2.1 Validation matrix

| Validation type | Where applied | Tool |
| --------------- | ------------- | ---- |
| Schema | Every stage I/O boundary | Zod |
| Cross-stage | Stage N output ↔ Stage N-1 contract | Custom validator |
| Re-validation | Every 3rd iter (Validator agent on Gemini Flash, cheap) | Custom |
| Drift detection | Stage 5 spec_fit ↔ closed-form sum | Hard assert |
| Trace completeness | Every iter end (≥ 6 spans expected) | Stage 6 introspect |

### 2.2 Retry budget per stage

```
analyze:         3 advocate × 2 retries  =  6 LLM calls max
go/no-go:        1 eval × 1 retry        =  2 LLM calls max
develop:         5 advocate × 2 retries  = 10 LLM calls max
deploy:          Cloud Build × 2 retries =  build attempts
judge:           5 critic × 1 retry      = 10 LLM calls max
introspect:      MCP × 1 retry           =  2 MCP calls max
self-improve:    BigQuery × 1 retry      =  2 BQ queries max
─────────────────────────────────────────────────────────
worst-case per iter: ~30 LLM calls + 2 builds + 2 MCP + 1 BQ
typical per iter (no retries): ~14 LLM calls + 1 build + 1 MCP + 1 BQ
```

### 2.3 Three-layer context preservation

| Layer | Purpose | Storage |
| ----- | ------- | ------- |
| **Postgres** | Canonical run state | Run / Iteration / JudgeVerdict / TraceRef |
| **Phoenix** | Observability + experiment history | OpenInference traces, Datasets, Experiments, Evals |
| **BigQuery** | Cross-run learning | `whyc_learning.run_outcomes` table |

### 2.4 Learning loop (BigQuery, kicks in N ≥ 10 runs)

```
At Stage 1 entry:
  prior_specs ← BQ.SELECT ProductSpec WHERE input_id_similarity(NEW_INPUT) > 0.6 LIMIT 5
  include as exemplars in analyzer prompt

At Stage 3 entry:
  winning_advocate_history ← BQ.SELECT advocate_id, COUNT(*) WHERE outcome='converged' GROUP BY advocate_id
  weight the multi-developer dispatch (still 5 parallel, but the high-win advocate gets higher temperature)

At Stage 7 entry:
  regen_history ← BQ.SELECT regen_flow, AVG(spec_fit_delta) WHERE weakest_flow = ?
  inform `decideNext` — if regenerating flow X has historically helped, do it
```

This is what makes the demo video say **"the agent gets smarter run by run"** — not just iter by iter, but across companies. Genuinely demonstrable.

---

## 3. GCP + Phoenix native feature inventory

| Feature | Where used | Scoring impact |
| ------- | ---------- | -------------- |
| **Agent Builder (sub-agents)** | Stage 1 (3) + Stage 3 (5) + Stage 5 (5) — 13 sub-agents total | Tech Implementation ★★★ (rules-mandated) |
| Vertex AI SDK | `gemini.ts` wrapper | Tech Implementation ★★ |
| **Vertex AI Evaluation** | Stage 2 IP-safety | Tech Implementation ★★ |
| **Cloud Build** | Stage 4 deploy | Tech Implementation ★★ |
| Cloud Run (services + jobs) | API / Web + pipeline jobs | Tech Implementation ★★, Stage-1 deliverable |
| Cloud SQL Postgres | Canonical state | Tech Implementation ★ |
| **BigQuery** | Learning loop | Tech Implementation ★★★, Idea Quality ★★ |
| Cloud Tasks | Next-iter queue | Tech Implementation ★ |
| Secret Manager | All credentials | Stage-1 deliverable |
| Cloud Armor | Rate limit + noindex injection | Stage-1 deliverable |
| **Phoenix MCP** | Stage 6 self-introspection | **Arize bonus ★★★** |
| **Phoenix Prompts** | Advocate + critic prompts versioned | Arize bonus ★★ |
| **Phoenix Datasets** | Per-stage logging | Arize bonus ★★ |
| **Phoenix Experiments** | Advocate A/B over time | Arize bonus ★★ |
| **Phoenix Evals** | 5-critic judge | Arize bonus ★★★ |
| OpenInference | All stages auto-instrumented | Arize bonus ★★ |

**9 GCP services + 5 Phoenix features = unprecedented integration depth** for a 2-person hackathon team.

---

## 4. Hackathon scoring axis impact

| Axis (25 pts each) | v1 estimate | v2 estimate | Delta |
| ------------------ | ----------- | ----------- | ----- |
| Tech Implementation | 17 | 23–24 | +6–7 |
| Design | 18 | 21–23 | +3–5 |
| Potential Impact | 18 | 21–22 | +3–4 |
| Quality of Idea | 19 | 24–25 | +5–6 |
| **TOTAL (max 100)** | **~72** | **~89–94** | **+17–22** |

Reasoning:
- **Tech Implementation** lift comes from Agent Builder sub-agents (rules-mandated), Vertex AI Eval, BigQuery learning, Phoenix 5-feature integration. Each is independently grade-able.
- **Design** lift comes from 5 developer advocates → I2 dedup → judge cross-pick. The final preview shipped to the wall is by construction the consensus of 5 design lenses.
- **Potential Impact** lift comes from the learning loop: "100 runs later, the agent is empirically better at this category of company." Demoable from BigQuery.
- **Quality of Idea** lift comes from PDD-on-Runtime being structurally unprecedented in the hackathon gallery. Judges have not seen 13 sub-agents adjudicating per-run in any prior submission.

---

## 5. Cost projection

```
Per converged run (3 iter average):
  Stage 1: 3 analyzers (Flash) + 1 synth (Pro)       ~$0.15
  Stage 2: 1 eval call (Flash)                        ~$0.02
  Stage 3: 5 developers (Pro) × 3 iter                ~$1.50
  Stage 4: Cloud Build minutes                        ~$0.05
  Stage 5: 5 critics (Pro) × 3 iter                   ~$1.20
  Stage 6: Phoenix MCP (free under 50k traces/mo)     ~$0.00
  Stage 7: BigQuery (free tier)                       ~$0.00
  Cloud Run + SQL fixed                                ~$0.20
  ──────────────────────────────────────────────────────────
  TOTAL per run                                       ~$3.12

12 demo runs:                                         ~$37
Buffer for retries + experiments:                     ~$25
TOTAL:                                                ~$62 of $100 credit (62 %)
```

Safety margin: $38 (38 %) remaining for: video re-renders, additional dataset experiments, demo-day live invocation.

---

## 6. Timeline (D-30 → D-0)

| Window | Work |
| ------ | ---- |
| **WK1 — D-30 → D-23** | $100 credit redeemed · Stage 1 multi-analyzer · Stage 3 multi-developer · Stage 5 5-critic · BigQuery schema · retry framework |
| **WK2 — D-22 → D-16** | Stage 4 real Cloud Build + deploy · Stage 2 Vertex AI Eval · context-preservation tests · DRY_RUN E2E integration |
| **WK3 — D-15 → D-9** | YC scraper · 12 verified companies · learning loop validated (10 runs into BigQuery, query returns useful priors) · video script |
| **WK4 — D-8 → D-3** | Agent Builder console screenshots · video recorded · README badges + screenshots · Devpost description |
| **WK5 — D-2 → D-0** | Final rehearsal · submit D-1 (2026-06-10) with 1h buffer |

---

## 7. Risk register

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Agent Builder API behavior differs from SDK | Medium | Medium | Keep Vertex AI SDK fallback path; cancel Agent Builder sub-agent dispatch if registration fails |
| BigQuery learning insufficient at N < 10 | High | Low | Empty-result handling; learning layer is optional, judge + introspect alone are sufficient |
| 5-developer parallel dispatch cost surge | Medium | Medium | DRY_RUN cost measurement first; degrade to 3-developer if projected cost > $4/run |
| Phoenix MCP HTTP spec drift | Low | Medium | `phoenix-client.ts` is the abstraction layer; one-place fix |
| YC company takedown request during demo | Low | High | M8 1h SLA already operational; 6 reserve candidates pre-verified |
| Cloud Build flakiness on first run | Medium | Low | 2× retry budget; documented manual-rebuild path |

---

## 8. Demo video (3 min, receipts tone)

```
0:00 – 0:15  Hook
             "VC raised. Hiring posted. Product page empty."

0:15 – 0:45  Input
             User pastes a public Y Combinator company URL on whyc.example

0:45 – 1:30  Live multi-agent progress
             [Stage 1] 3 analyzers (split screen) → 1 spec via synthesis
             [Stage 3] 5 developers in parallel → I2 dedup → 1 winner
             [Stage 5] 5 critics scoring panel → spec_fit 0.71
             [Stage 6] Phoenix dashboard, MCP query in progress

1:30 – 2:15  Self-improvement loop accelerated
             iter 3 → spec_fit 0.84
             iter 7 → spec_fit 0.96, converged
             Phoenix experiment comparison: "+12 % vs prior converged runs"

2:15 – 2:45  Receipts grid
             12 real YC companies × days_since_DD vs WhyC_ship_time

2:45 – 3:00  Closing
             "Same pipeline. Any founder, any idea, 1 day."
             [Apache-2.0 badge] [github.com/Two-Weeks-Team/WhyC]
```

---

## 9. Operational notes (post-credit-application)

- **Google Cloud account**: `app.2weeks@gmail.com` (existing, already linked to Devpost via the credit application)
- **Billing account**: the one named "크레딧" (created specifically to redeem this hackathon's $100 coupon)
- **Redeem path**: `console.cloud.google.com/billing/redeem` — apply the coupon to the "크레딧" billing account only
- **Approval window**: 1–5 business days; coupon arrives from `Partner-developer-marketing@google.com`
- **Hard redeem deadline**: 2026-06-04 (no extension)
- **Project to be linked**: `whyc-prod` (to be created — `deploy/README.md` §1 documents the steps)

---

## 10. What's NOT in v2 (deferred)

These were considered and explicitly held back because they don't move the scoring needle for the hackathon window:

- Multi-language analyzer (Korean / Japanese / etc.) — English-only for v1 dataset
- Real-time progressive deploy (deploy mid-iteration as flows complete) — saved for v3
- Cross-company shared learning beyond batch-level — needs N ≥ 50 runs
- Public submission form (anyone can paste a URL) — H1 locked this closed
- Mobile app — H1 locked web-only

---

## 11. Verification protocol before implementation

This document is a **proposal**, not a commitment. Before any code is written for v2, the team will:

1. Walk through this document together
2. Confirm each of the 13 sub-agent roles is sensible
3. Confirm the cost projection holds against current Gemini pricing
4. Confirm the Agent Builder console actually supports the sub-agent registration pattern we describe
5. Confirm BigQuery free tier covers the per-run insert volume

After verification, an `architecture-v2-locked.md` is created with the final agreed shape, and implementation work begins against that.

---

## 12. Changelog

| Date | Author | Change |
| ---- | ------ | ------ |
| 2026-05-11 | Two Weeks Team | Initial proposal authored (v0.1, awaiting verification) |
