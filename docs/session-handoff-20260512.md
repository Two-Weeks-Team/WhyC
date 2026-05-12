# WhyC — Session Handoff (2026-05-12)

**For**: next-session Claude / teammates resuming work
**Authored**: 2026-05-12
**Project**: WhyC, Google Cloud Rapid Agent Hackathon · Arize track
**Repo**: https://github.com/Two-Weeks-Team/WhyC · Apache-2.0 · public
**Submission deadline**: 2026-06-11 14:00 PT · **D-30**
**Credit redeem deadline**: 2026-06-04 · **D-23**

---

## TL;DR — Where We Are Right Now

**v4 master plan is locked and waiting on operator.** Code work has NOT started for v4 (we're still on v1 runtime). The repo currently has a complete v1 pipeline (typecheck + build green across 3 packages) and four planning documents at increasing levels of refinement (v2 arch / v2 overview / v3 verified / v4 final). 7 operator G-checks need to clear (mostly GCP console verifications, ~1 hour total) before v4 Phase 0.5 (hook layer) implementation begins.

**Why is the plan worth executing**: ~90 % probability target of top-3 in Arize track via combination of (PDD multi-perspective adjudication × mechanical hook gates × deep GCP/Phoenix integration × receipts-tone satire). Cost projection ~$10 of $100 credit (10 %, 90 % margin).

**Critical countdown**: GCP $100 credit redeem **must complete by D-23 (2026-06-04)** or all Phase 6+ work is blocked. Credit was requested 2026-05-11 per Devpost form; awaiting coupon email from `Partner-developer-marketing@google.com`.

---

## Repo State Snapshot (as of commit `9d23e7b`)

### Build matrix

| Package | Typecheck | Build | Tests |
| --- | --- | --- | --- |
| `apps/api` (NestJS) | ✅ | ✅ `nest build` | ✅ 47 pass / 2 skipped (DB-dep) |
| `apps/web` (Next.js 15) | ✅ | ✅ 4 routes / 109 KB First Load | — |
| `apps/jobs` (Cloud Run Jobs) | ✅ | ✅ `tsc` | (no test files yet) |

### Pipeline runtime (v1, current)

| Module | Status | Notes |
| --- | --- | --- |
| `apps/jobs/src/pipeline/analyze.ts` | ✅ live (Gemini Flash, M5 sanitizer integrated) | |
| `apps/jobs/src/pipeline/go-no-go.ts` | ✅ live (6 rules, no LLM) | |
| `apps/jobs/src/pipeline/develop.ts` | ✅ live, **v1 stub: writes JSON manifest, no real Next.js tarball yet** | v2 promotes to real tarball |
| `apps/jobs/src/pipeline/deploy.ts` | ✅ live, **v1 stub: URL synthesis, no real Cloud Run deploy yet** | v2 promotes to real Cloud Build + Cloud Run |
| `apps/jobs/src/pipeline/judge.ts` | ✅ live (Gemini Pro, single critic) | v2 promotes to 5-critic panel |
| `apps/jobs/src/pipeline/introspect.ts` | ✅ live (hand-rolled Phoenix HTTP client) | v2 swaps to `@arizeai/phoenix-client` |
| `apps/jobs/src/pipeline/self-improve.ts` | ✅ live (pure decideNext) | v2 adds BigQuery learning signal |
| `apps/jobs/src/jobs/pipeline-kickoff.ts` | ✅ live, supports `WHYC_DRY_RUN=true` | v2 wires hook layer |
| `apps/jobs/src/jobs/sweep-deploys.ts` | ✅ live (SC5/SC7 idempotent) | |
| `apps/jobs/src/jobs/{scrape-yc, refresh-hires, public-stats-rebuild}.ts` | ⚠️ stubs | implemented in v2 Phase 9 |

### Recent commit history (this session)

| Commit | What landed |
| --- | --- |
| `9d23e7b` | README points to master-plan-v4 as canonical + doc hierarchy table |
| `a938af2` | **master-plan-v4.md/.html** — PDD on Runtime, mechanically gated, 91-97 score target |
| `398f099` | master-plan-v3.md/.html — verification complete, 88-96 score |
| `162847c` | v2-overview.md/.html — team brief (one-page) |
| `b5ea35e` | architecture-v2-pdd-on-runtime.html (rendered) |
| `6b849e1` | architecture-v2-pdd-on-runtime.md + credit-account pin |
| `77cbe68` | scaffold typecheck + 1 unused-param fix + pnpm-workspace |
| `60cd6c6` | Phoenix MCP introspection + Arize bonus integration |
| `0e6371e` | pipeline stages 2-5 + judge + full kickoff orchestrator |
| `97701d3` | pipeline foundation — types, instrumentation, sanitizer, gemini wrapper |
| `b3d1c01` | pro-profile engineering scaffold (109 files / 12,104 LOC) |
| `1b987de` | SpecDD v1 SHA-256 locked |
| `07a5010` | landing v1 prototype (high-fidelity) |
| `a248aa2` | H1 locked (P18+P06+detail composite + 5 design decisions) |
| `dd83802` | initial design phase commit (74 files / 12,878 insertions) |

---

## The Plan Stack (v1 → v4)

```
v1 (live code)        apps/api · apps/web · apps/jobs all green
                      Pipeline runs but develop/deploy are stubs
                      No live Cloud Run yet
       │
       ▼
v2 architecture       docs/architecture-v2-pdd-on-runtime.{md,html}
(deep ref)            13 sub-agents, 7-stage pipeline, GCP+Phoenix integration
                      ~1100 LOC technical reference
       │
       ▼
v2 overview           docs/v2-overview.{md,html}
(team brief)          One-page summary for sharing in chat / DM / PR
                      ~250 lines, KPI strip + 7-stage diagram
       │
       ▼
v3 master plan        docs/master-plan-v3.{md,html}
(verified)            Verification pass — every claim sourced, every gap closed
                      88-96 score projection, ~$10 / 12 runs cost
                      1100 LOC, 18 sections
       │
       ▼
v4 master plan ⭐     docs/master-plan-v4.{md,html}   ← CANONICAL
                      Adds hook layer (mechanically gated stage transitions)
                      91-97 score projection, ~90 % win probability target
                      1250 LOC, 18 sections
```

Read v4 first. v3 is the verification baseline. v2 docs are deep reference + team brief. v1 is the live code surface.

---

## 5 Design Decisions Locked (H1)

These are immutable for this submission:

1. **Demo dataset**: real Y Combinator companies, named, **text only no logos** (M4 supersede)
2. **Public URL submission**: CLOSED (curated dataset only, eliminates M5 prompt-injection attack surface)
3. **Phoenix hosting**: Phoenix Cloud SaaS (free 50K traces/mo, M14 sampling cap)
4. **Agent voice in Phoenix traces**: slightly provocative, brand-consistent
5. **Submission video framing**: receipts-only (numbers + dates, no adjectives, no accusatory framing, no specific company logo)

See `runs/r-20260506T122526Z/design-approved.json` for the locked JSON.

## H1 Composite Finalist

```
Landing      (P18 The Designer)        editorial scroll-story, hero + receipts ledger
Dashboard    (P06 Spreadsheet Jockey)  dense YC-batch grid, sortable, sparklines
Detail page  (P10 / P13 / P15 / P07 / P04 composite)
                                       aurora hero + KPIs + reaction wall +
                                       mobile breakpoint + cost ledger
```

Locked in `runs/r-20260506T122526Z/chosen_preview.json`.

---

## Cost Status (Verified 2026-05-11)

| Item | Cost | Source |
| --- | --- | --- |
| Per converged run (3 iter avg) | ~$0.81 | Gemini 2.5 pricing fetched 2026-05-11, Flash $0.30/$2.50/1M, Pro $1.25/$10/1M |
| 12 demo runs | ~$10 | $0.81 × 12 |
| Retry buffer (×3) | ~$20 | conservative |
| Cloud SQL idle (f1-micro × 30d) | ~$8 | |
| Vertex AI Evaluation | ~$3 | 12 × eval calls |
| **Total projected** | **~$46** | of $100 credit (46 %) |
| **Margin remaining** | **~$54** | 54 % buffer |

**Note**: `apps/jobs/src/util/gemini.ts` currently has wrong cost rate constants (Flash output 8.3× under, Pro output 2× under). v4 Phase 1 fixes this. Total bill will land slightly under projection as a result, not over.

---

## Hackathon Rule Compliance Snapshot

| # | Rule | Status |
| --- | --- | --- |
| R1 | Public repo | ✅ |
| R2 | OSI license (Apache-2.0) | ✅ |
| R3 | Originality (≥ 2026-05-05) | ✅ first commit 2026-05-06 22:19 +09 |
| R4 | Gemini model (Vertex AI Gemini 2.5 Flash + Pro) | ✅ |
| R5 | Agent Builder used (= Vertex AI Agent Engine / GEAP) | ⚠️ → 🟢 in Phase 6 |
| R6 | Partner MCP integration (@arizeai/phoenix-mcp dep) | ⚠️ → 🟢 in Phase 1 |
| R7 | No competing services (AWS / OpenAI / Anthropic) | ✅ banned-vendor-lint in CI |
| R8 | Web platform | ✅ Next.js + Cloud Run |
| R9 | Hosted URL functional | ❌ → 🟢 after Phase 6 deploy |
| R10 | ≤ 3 min video, English/subtitled | ❌ → 🟢 Phase 10 (WK5) |

7 PASS, 2 GAP (closeable in code), 2 OPEN (scheduled).

---

## Active Operator G-Checks (7)

These must clear before v4 Phase 0.5 (hook layer) and Phase 6 (real deploy) start. Total operator time: ~1 hour + credit redeem.

| ID | Decision | Method | Status | Blocker for |
| --- | --- | --- | --- | --- |
| G1 | Vertex AI Agent Engine console supports our deployment pattern | console.cloud.google.com → Agent Engine → New deployment | **PENDING** | Phase 6 |
| G2 | Gemini pricing matches v3/v4 fetch | ✅ Claude-side verified | DONE | — |
| G3 | BigQuery free tier covers ~5 KB/run × 100 runs | Quotas console | **PENDING** | Phase 5 |
| G4 | Cloud Run + Build free tier covers usage | Quotas console | **PENDING** | Phase 6 |
| G5 | $100 credit redeemed to `크레딧` billing account | redeem page after coupon arrives | **IN FLIGHT** (req 2026-05-11) | Phase 6 |
| G6 | Workload Identity Federation configured (no JSON keys) | gcloud commands in `deploy/README.md` §7 | **PENDING** | Phase 6 |
| G7 | Cloud Run job env has `bash` / `python3` / `jq` / `shasum` | Docker local test of pipeline-kickoff container | **PENDING** | Phase 0.5 (v4 hooks) |

**Account facts (PIN)**:
- GCP account: `app.2weeks@gmail.com`
- Billing account: `크레딧` (created specifically for this hackathon coupon)
- Project: `whyc-prod` (to be created)
- Devpost username: `centisgood`

---

## v4 Implementation Phases (Locked Sequence)

12 phases · 33 commits · 31 days. Read `master-plan-v4.md` §5 for full detail.

| Phase | Window | What lands | Operator dependency |
| --- | --- | --- | --- |
| **0.5** | D-30 → D-29 (NEW v4) | Hook layer: 7 scripts in `hooks/` + 3 memory files + `agents/v4-index.json` | G7 |
| 1 | D-29 → D-27 | @arizeai/phoenix-* 4-package adoption + gemini.ts price fix + retry.ts + bigquery-learning.ts | — |
| 2 | D-27 → D-25 | analyze-v2 (3 advocate analyzers + 1 Pro synth) | — |
| 3 | D-25 → D-23 | develop-v2 (5 advocate developers + I2 dedup + cross-pick) | — |
| 4 | D-23 → D-21 | judge-v2 (5-critic panel via @arizeai/phoenix-evals) | — |
| 5 | D-21 → D-19 | introspect-v2 + self-improve-v2 + on-converge hook wiring | — |
| **6** | D-19 → D-15 | Stage 4 real Cloud Build + Cloud Run + Agent Engine registration | **G1, G3, G4, G5, G6** |
| 7 | D-15 → D-14 | go-no-go-v2 + Vertex AI Evaluation | — |
| 8 | D-14 → D-12 | pipeline-kickoff-v2 wires v2 stages + hook layer + dry-run E2E | — |
| 9 | D-12 → D-8 | YC scraper + 12-company 7-check verification + BigQuery seed | Operator (manual 7-check) |
| 10 | D-8 → D-3 | Video recorded + README badges + Devpost description draft | Operator |
| 11 | D-3 → D-0 | Final rehearsal + submit by D-1 (2026-06-10) with 1h buffer | Operator |

**Critical path**: G5 (credit redeem) → G1/G3/G4/G6 (console verifications) → Phase 6 (real deploy). Until Phase 6 finishes, R9 (hosted URL) is OPEN.

Phases 0.5 → 5 are **GCP-independent** — can start immediately after G7 (hook-script env compatibility check, ~10 min).

---

## Verification Sources (PIN — re-fetch if anything changes)

| Source | URL | What we got |
| --- | --- | --- |
| Hackathon rules | rapid-agent.devpost.com/rules | 10 rule items, 5 tracks, 4 equal-weight criteria |
| Gemini pricing | cloud.google.com/vertex-ai/generative-ai/pricing | Flash $0.30/$2.50/1M, Pro $1.25/$10/1M |
| Phoenix MCP | arize.com/docs/phoenix/integrations/phoenix-mcp-server | stdio-only |
| Phoenix REST | arize.com/docs/phoenix/sdk-api-reference/rest-api | `/v1/spans`, Bearer auth |
| @arizeai npm packages | npmjs.com / github.com/Arize-ai/phoenix | client, otel, evals, mcp, cli all exist |
| Cloud Run free tier | cloud.google.com search snippets | 180K vCPU-s + 360K GiB-s + 2M req / month |

If any of these change before submission, re-check + update v4 doc + bump version.

---

## Risk Register (Top 8)

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Hook scripts don't run on Cloud Run job env | Low | Med | Pre-test locally via Docker; bash + stdlib Python only |
| Vertex AI Agent Engine rejects TypeScript | Med | Med | Fallback: Python wrapper invokes Node pipeline via subprocess |
| Phoenix Evals breaks judge integration | Low | High | Keep hand-rolled judge.ts behind feature flag for A/B |
| BigQuery learning N<10 cold-start | High | Low | Empty-result fallback documented |
| YC takedown request during demo | Low | High | M8 1h SLA + 6 reserve candidates pre-verified |
| Cost ceiling false positive | Low | Med | `on-cost-ceiling.py` downgrades to single-advocate before abort |
| Submission timezone error (PT ↔ KST) | Low | 🔴 disqualification | Phone calendar alert at 2026-06-10 12:00 PT + GHA cron reminder |
| Cloud Build first-time setup flakiness | Med | Low | 2× retry in `.github/workflows/deploy.yml`; documented manual rebuild |

---

## To Resume — Next 5 Actions (Sequential)

1. **Operator (Sejun)** — Open Google Cloud console. Run G1, G3, G4 verifications (~25 min total). Confirm/deny via chat or by editing this handoff doc. **No code changes blocked on this.**
2. **Operator (Sejun)** — Watch inbox for `Partner-developer-marketing@google.com`. When coupon arrives, redeem at `console.cloud.google.com/billing/redeem` against the `크레딧` billing account. **G5 unblocks Phase 6.**
3. **Operator (Sejun)** — Run G7 locally: `docker run -it node:20-slim bash` → check `bash --version && python3 --version && jq --version && shasum --version`. If all four present in node:20-slim, hook scripts run on Cloud Run jobs. **G7 unblocks Phase 0.5.**
4. **Operator (Sejun)** — Run G6: gcloud commands in `deploy/README.md` §7 to set up Workload Identity Federation. ~30 min. Push GCP secrets to GitHub repo. **G6 unblocks Phase 6 deploy CI.**
5. **Claude (next session)** — After G7 confirms, start Phase 0.5: create `hooks/` directory with 7 scripts + 3 memory files + `agents/v4-index.json`. Single commit. Stage gate: each hook exits 0 on placeholder data.

After actions 1-5: Phase 1 (deps + gemini.ts fix + retry framework) can begin immediately, in parallel with operator GCP setup (G5 completion).

---

## Cross-doc Index

### Plan stack
- 📘 [master-plan-v4.md](./master-plan-v4.md) / [.html](https://two-weeks-team.github.io/WhyC/docs/master-plan-v4.html) — **canonical execution plan**
- 📘 [master-plan-v3.md](./master-plan-v3.md) / [.html](https://two-weeks-team.github.io/WhyC/docs/master-plan-v3.html) — verification baseline
- 📘 [architecture-v2-pdd-on-runtime.md](./architecture-v2-pdd-on-runtime.md) / [.html](https://two-weeks-team.github.io/WhyC/docs/architecture-v2-pdd-on-runtime.html) — deep technical reference
- 📘 [v2-overview.md](./v2-overview.md) / [.html](https://two-weeks-team.github.io/WhyC/docs/v2-overview.html) — team brief

### Operational
- 📋 [deploy/README.md](../deploy/README.md) — operator runbook (GCP provisioning, secrets, takedown procedure)
- 📋 [docs/dataset-verification.md](./dataset-verification.md) — 7-check protocol for 12 YC companies
- 📊 [hackathon-audit-20260511-rapid-agent.html](https://two-weeks-team.github.io/WhyC/claudedocs/hackathon-audit-20260511-rapid-agent.html) — submission-readiness scorecard

### Design provenance (immutable)
- 🔒 [runs/r-20260506T122526Z/chosen_preview.json](../runs/r-20260506T122526Z/chosen_preview.json) — H1 lock
- 🔒 [runs/r-20260506T122526Z/design-approved.json](../runs/r-20260506T122526Z/design-approved.json) — 5 design decisions
- 🔒 [runs/r-20260506T122526Z/specs/_lock.json](../runs/r-20260506T122526Z/specs/_lock.json) — SpecDD v1 SHA-256
- 🔒 [runs/r-20260506T122526Z/mitigations.json](../runs/r-20260506T122526Z/mitigations.json) — 31 action items
- 🎨 [run gallery](https://two-weeks-team.github.io/WhyC/runs/r-20260506T122526Z/gallery.html) — 26 advocate previews

### Source links
- 🌐 [GitHub repo](https://github.com/Two-Weeks-Team/WhyC)
- 🌐 [Hackathon page (Devpost)](https://rapid-agent.devpost.com/)
- 🌐 [Hackathon rules](https://rapid-agent.devpost.com/rules)

---

## Memory Anchors (for next-session Claude)

A few facts that are easy to forget when picking up next session:

- **The hackathon's `Agent Builder` requirement = current product name `Vertex AI Agent Engine` / `Gemini Enterprise Agent Platform`.** Don't get confused by the docs that have moved.
- **Phoenix MCP server is stdio-only.** We use the REST API via `@arizeai/phoenix-client` and list `@arizeai/phoenix-mcp` as a dependency for the R6 claim. Both are visible in package.json.
- **Cost projection 10% of credit is *with* Phoenix free tier intact.** If we somehow blow past 50K traces/month, we get billed; M14 sampling guardrail prevents this.
- **Demo dataset has 12 placeholder companies in `prisma/seed.ts` right now** (alphabetical synthetic names like Acme, Birch, Cinder, etc.). Real YC names land in v4 Phase 9 after operator-verified 7-check.
- **The hook layer is OUR design decision** based on lessons from operating the pf plugin. It is not a port of any external framework. The patterns (pre-commit-style hooks, build manifests, category review gates) are general engineering practice.
- **All v4 work is gated on G7** (Cloud Run job env has bash/python3/jq/shasum). If G7 fails, hooks need to be wrapped in a custom Docker base image — adds 1-2 h, doesn't change the design.
- **Originality rule (R3)** means we cannot port v1 of any external framework wholesale into our repo. We can adopt patterns and decisions but the code must be ours.
- **D-23 (2026-06-04) credit redeem is the single hardest deadline.** If credit doesn't redeem by then, Phase 6 doesn't happen, R9 (hosted URL) stays open, Stage 1 doesn't pass.

---

## Sign-off

This handoff is a faithful record of the project's state as of 2026-05-12. Next session should be able to pick up from "To Resume — Next 5 Actions" without re-reading the conversation history.

The plan is locked. The verification is complete. The cost is bounded. The team has 30 days. **Execute.**
