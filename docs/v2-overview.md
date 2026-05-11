# WhyC v2 — Team Brief

> **One-page summary of the v2 architecture.** Full detail lives in [`architecture-v2-pdd-on-runtime.md`](./architecture-v2-pdd-on-runtime.md). This file is for sharing with teammates in chat / DM / PR before the verification meeting.

---

## The Hero

**While they hire, we ship — and the agent panel adjudicates the build.**

WhyC is a satirical counter-product for VC-backed YC teams that take six months to ship what an agent can produce in a day, *and* a practical fast-POC accelerator for any founder. v1 ships in 31 days; v2 is the runtime-level redesign that turns WhyC from "another vibe-coding tool" into **a 13-sub-agent panel that converges on a build via structured adjudication.**

| | v1 (current) | v2 (proposed) |
| --- | --- | --- |
| Per-stage perspectives | **1** (single LLM call) | **3 / 5 / 5** (analyze / develop / judge) |
| Total sub-agents | 0 | **13** |
| Diversity validation | None | I2 Jaccard + structural hash |
| Learning across runs | None | **BigQuery** queries past outcomes |
| GCP features used | 4 | **9** |
| Phoenix features used | 1 | **5** |
| Differentiation vs Bolt / Lovable / v0 | Weak | **Structurally unprecedented** |

---

## The Pipeline (7 stages)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Stage 0  pre-flight                                                    │
│            URL → sanitize → content_sha256 cache                        │
├─────────────────────────────────────────────────────────────────────────┤
│  Stage 1  analyze              3 advocate analyzers (Flash)             │
│                                  → synthesis (Pro)                      │
│                                  → 1 ProductSpec with provenance        │
├─────────────────────────────────────────────────────────────────────────┤
│  Stage 2  go / no-go           6 rules + Vertex AI Eval IP-safety       │
├─────────────────────────────────────────────────────────────────────────┤
│  Stage 3  develop              5 advocate developers (Pro)              │
│                                  → I2 dedup                             │
│                                  → cross-pick winner                    │
├─────────────────────────────────────────────────────────────────────────┤
│  Stage 4  deploy               Cloud Build → Cloud Run (real)           │
├─────────────────────────────────────────────────────────────────────────┤
│  Stage 5  judge                5 specialist critics (Pro)               │
│                                  → meta-tally spec_fit                  │
├─────────────────────────────────────────────────────────────────────────┤
│  Stage 6  introspect           Phoenix MCP self-query                   │
│                                  → trace summary + experiment compare   │
├─────────────────────────────────────────────────────────────────────────┤
│  Stage 7  self-improve         judge + trace + BigQuery learning        │
│                                  → converge | regen | ceiling           │
└─────────────────────────────────────────────────────────────────────────┘
```

**Three loops, not one:**

1. **Within-iteration loop** — 5 developers compete, 5 critics judge, winner picked
2. **Across-iteration loop** — judge spec_fit + trace introspection decide regen
3. **Across-run loop** — BigQuery accumulates outcomes, future runs query history

---

## Why This Wins (4 scoring axes, 25 pts each)

| Axis | v1 estimate | v2 estimate | What changed |
| --- | --- | --- | --- |
| Tech Implementation | 17 | **23–24** | Agent Builder + Vertex Eval + BigQuery learning + Phoenix 5-feature |
| Design | 18 | **21–23** | 5 design lenses → adjudicated winner is by construction the consensus |
| Potential Impact | 18 | **21–22** | Learning loop demonstrates "agent gets smarter run by run" |
| Quality of Idea | 19 | **24–25** | PDD-on-Runtime is structurally unprecedented in the gallery |
| **TOTAL / 100** | **~72** | **~89–94** | **+17–22 points** |

The Quality of Idea axis is the biggest swing. v1 in the gallery reads as "another AI builds an app." v2 reads as "an agent panel structurally adjudicates the build" — judges have not seen this pattern.

---

## What It Costs

```
Per converged run (3 iter average):     ~$3.12
12 demo dataset runs:                   ~$37
Buffer for retries + experiments:       ~$25
─────────────────────────────────────────────
TOTAL projected:                        ~$62 of $100 credit (62 %)
Margin remaining:                       ~$38 (38 %)
```

We are well inside the $100 credit. Retry budget is generous; even with worst-case retries on every stage, projected stays under $80.

---

## How Long (D-30 → D-0)

| Week | Window | Work |
| --- | --- | --- |
| **WK1** | D-30 → D-23 | Stage 1 multi-analyzer · Stage 3 multi-developer · Stage 5 5-critic · BigQuery schema · retry framework. **Credit redeems this week** (deadline 2026-06-04). |
| **WK2** | D-22 → D-16 | Stage 4 real Cloud Build + deploy · Stage 2 Vertex Eval · context-preservation tests · DRY_RUN E2E |
| **WK3** | D-15 → D-9 | YC scraper · 12 verified companies · learning loop runs 10× into BigQuery · video script |
| **WK4** | D-8 → D-3 | Agent Builder console screenshots · video recorded · README badges · Devpost description |
| **WK5** | D-2 → D-0 | Final rehearsal · submit D-1 (2026-06-10) with 1h buffer |

---

## Three Things to Verify Before We Build

Per `architecture-v2-pdd-on-runtime.md` §11 — we walk through these together before any v2 code lands:

1. **Agent Builder console actually supports the sub-agent registration pattern we describe.** If it doesn't, the 13-sub-agent structure has to be implemented via direct Vertex AI SDK calls (which works, but loses one of the GCP feature signals).
2. **Gemini current pricing matches our $3.12/run projection.** Flash + Pro rates may have changed since the project started — re-check against console.
3. **BigQuery free tier covers the per-run insert volume.** Conservative estimate is ~50 rows per run × 100 runs = 5 K rows / month, well within free tier — but confirm before wiring.

If all three pass → `architecture-v2-locked.md` is created and implementation begins. If any fail → degraded path documented and locked.

---

## What's NOT in v2

These were considered and explicitly held back because they don't move scoring within the hackathon window:

- Multi-language analyzer (Korean / Japanese) — English only for v1 dataset
- Real-time progressive deploy (deploy mid-iteration as flows complete) — v3
- Cross-company shared learning beyond batch-level — needs N ≥ 50 runs
- Public submission form — H1 locked closed
- Mobile native app — H1 locked web-only

---

## Operational Notes

- **GCP account** for redemption: `app.2weeks@gmail.com`
- **Billing account** name: `크레딧` (created specifically for this hackathon coupon)
- **Project**: `whyc-prod` (provisioned per `deploy/README.md` §1)
- **Repo**: https://github.com/Two-Weeks-Team/WhyC
- **Pages**: https://two-weeks-team.github.io/WhyC/

---

## Links

- 📐 [Full architecture (12 sections, validation matrix, risks, demo scenario)](./architecture-v2-pdd-on-runtime.md)
- 🎨 [Same doc rendered on Pages](https://two-weeks-team.github.io/WhyC/docs/architecture-v2-pdd-on-runtime.html)
- 🔒 [v1 spec lock (SHA-256)](../runs/r-20260506T122526Z/specs/_lock.json)
- 🏆 [Hackathon audit report (D-31)](https://two-weeks-team.github.io/WhyC/claudedocs/hackathon-audit-20260511-rapid-agent.html)
- 📁 [26-advocate gallery from PreviewDD design phase](https://two-weeks-team.github.io/WhyC/runs/r-20260506T122526Z/gallery.html)
- 🚀 [Hackathon page](https://rapid-agent.devpost.com/) · Arize track

---

## Status

📋 **Proposal — awaiting verification.** No v2 code has been written. The v1 pipeline (analyze · go-no-go · develop · deploy · judge · introspect · self-improve) is live, typechecked, and builds clean across `apps/api` · `apps/web` · `apps/jobs`. v1 deferred items become v2's expansion points.

When the team has read this brief and the verification points clear, the implementation order is:

1. BigQuery schema + retry framework (foundation)
2. Stage 1 multi-analyzer (lowest-risk multi-advocate stage to validate the pattern)
3. Stage 3 multi-developer (highest-impact)
4. Stage 5 5-critic (highest-cost; validate against budget before committing)
5. Stage 6 Phoenix MCP extensions
6. Stage 7 BigQuery learning
7. Stage 4 real Cloud Build + Cloud Run deploy
8. End-to-end DRY_RUN test
9. Real dataset (WK3 scrape) + final tuning
