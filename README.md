# WhyC

> **While they hire, we ship.**

WhyC is the satirical counter-product for funded teams that take six months to deploy what an agent ships in a day. Paste a job-posting URL — get a hosted, working preview in under 24 hours, with a self-improvement loop that climbs spec-fit until the deployed app actually matches the pitch it claims to be.

This repository is the **design phase** for a submission to the [Google Cloud Rapid Agent Hackathon](https://rapid-agent.devpost.com/) — Arize track. Production code lands here as it's built.

---

## What WhyC does

```
[paste job-posting URL]
       ↓
●  analyzing posting              ✓ 12s
●  extracting product hypothesis  ✓ 31s
●  generating Next.js scaffold    ▓▓▓ 9m
●  deploying to Cloud Run         ✓
●  first deploy live              spec-fit 71%

   ↻ self-improvement loop running…
   iter  3   spec-fit  84% ▲
   iter  7   spec-fit  92% ▲
   iter 11   spec-fit  96%  — converged
```

A multi-agent pipeline reads the posting, infers the product hypothesis, generates a Next.js front-end with a working API or two, deploys to Cloud Run, then sits in a self-improvement loop: Phoenix MCP queries the agent's own OpenInference traces, an LLM-as-judge scores whether the deployed preview matches the extracted spec, and only the under-spec flows are regenerated until convergence.

The headline claim is "1 day vs 6 months." The technical claim is observable, measurable spec-fit improvement on every iteration.

---

## Stack (hackathon-locked)

| Layer | Choice |
| ----- | ------ |
| Model | Gemini (Vertex AI / Agent Platform SDK) |
| Agent runtime | Code-owned via Google ADK + Cloud Run |
| Orchestration | Google Cloud Agent Builder |
| Observability | Arize Phoenix MCP + OpenInference auto-instrumentation |
| Front-end | Next.js (web platform) |
| Deploy | Cloud Run + Secret Manager |

Per hackathon rules, no AWS / OpenAI / Anthropic APIs serve as the agent backbone, and all code in this repository is created on or after **2026-05-05** (contest start).

---

## Repository layout

```
.
├── hackathon/        — captured originals from rapid-agent.devpost.com
│   ├── 01-overview.md
│   ├── 02-rules.md
│   ├── 03-resources.md
│   ├── 04-arize-track.md
│   ├── 05-elastic-track.md
│   ├── 06-fivetran-track.md
│   └── SUMMARY.md
├── runs/<run-id>/    — PreviewForge design run (26 advocate previews, 4-panel votes,
│                       mitigation checklist, gallery, locked spec). The actual product
│                       code is built using these artifacts as input, not the artifacts
│                       themselves.
├── .claude/          — workspace permissions for the pf design tool
├── LICENSE           — Apache-2.0 (OSI-approved, hackathon-required)
└── README.md
```

Once SpecDD locks the OpenAPI / Prisma schema and engineering scaffolds the Cloud Run service, source will land in `apps/api/`, `apps/web/`, `packages/sdk/` — separate from the design artifacts in `runs/`.

---

## Status

**Phase**: v1 pipeline foundation shipped (analyze · go-no-go · develop · deploy · judge · introspect · self-improve). **v4 master plan locked**, awaiting operator G-checks before implementation begins.

**Submission deadline**: 2026-06-11, 14:00 PT. **Credit redeem deadline**: 2026-06-04 (D-24).

### Canonical execution plan

**[📋 Master Plan v4](./docs/master-plan-v4.md) ([rendered HTML](https://two-weeks-team.github.io/WhyC/docs/master-plan-v4.html))** — PDD on Runtime · mechanically gated · 13 sub-agents · 7 hook points · 9 GCP × 5 Phoenix features · projected 91–97 / 100 score · ~90 % target probability of top-3 in Arize track. Cost: ~$10 of $100 credit (10 %, 90 % margin).

### Document hierarchy

| Doc | Purpose | When to read |
| --- | --- | --- |
| [Master Plan v4](https://two-weeks-team.github.io/WhyC/docs/master-plan-v4.html) | **Canonical execution plan** | First read for execution |
| [Master Plan v3](https://two-weeks-team.github.io/WhyC/docs/master-plan-v3.html) | Verification baseline | Reference for what was verified, when |
| [v2 Architecture](https://two-weeks-team.github.io/WhyC/docs/architecture-v2-pdd-on-runtime.html) | Deep technical reference | Detailed contract specs |
| [v2 Overview](https://two-weeks-team.github.io/WhyC/docs/v2-overview.html) | Team brief | Quick share to new collaborators |
| [Hackathon Audit](https://two-weeks-team.github.io/WhyC/claudedocs/hackathon-audit-20260511-rapid-agent.html) | Submission-readiness scorecard | Pre-submission checklist |
| [Run gallery](https://two-weeks-team.github.io/WhyC/runs/r-20260506T122526Z/gallery.html) | 26 advocate previews from design phase | Design provenance |

---

## Brand & legal posture

The aggressive YC-mocking framing ("WHILE YC HIRES, WE SHIP") is intentional and structural — it's a categorical critique of post-Demo-Day delivery patterns observable on public job boards, not a targeting of any specific company. The 3-minute submission video uses anonymised or synthetic job postings only; no third-party trademarks, names, or logos appear in any submission artifact. Live deploys generated by WhyC use signed, expiring URLs with `noindex` headers and 24-hour TTLs, and ship with a public takedown channel.

---

## Team

Two-person team operating as **Two Weeks Team**.
Designated representative for hackathon submission: Sejun Kim (centisgood@gmail.com).

---

## License

Licensed under the [Apache License 2.0](./LICENSE) — OSI-approved, commercial use permitted, patent grant included. Required for hackathon Stage-1 pass.
