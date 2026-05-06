# WhyC × Google Cloud Rapid Agent Hackathon — Brief

**Captured:** 2026-05-06 (day 2 of contest)

This file is the single source of truth for the constraints we're building under. The full originals live in `01-overview.md`, `02-rules.md`, `03-resources.md`, and the per-track files `04-…` `05-…` `06-…`.

---

## TL;DR — Hard Constraints

| # | Constraint | Source |
| - | ---------- | ------ |
| 1 | **Gemini** is the LLM. Not Claude, not GPT, not local models. | Rules §Submission |
| 2 | **Google Cloud Agent Builder** is the agent platform. (Code-owned runtime if Arize track.) | Rules §Submission |
| 3 | Must integrate **at least one Partner MCP server** — Arize / Elastic / Fivetran. Pick **one** track. | Rules §Submission |
| 4 | Cannot use services that **directly compete** with GCP or the chosen Partner. (No AWS Bedrock / Pinecone-as-vector-DB-on-Elastic-track / etc.) | Rules §Submission |
| 5 | Project must run on **web, Android, or iOS**. | Rules §Submission |
| 6 | Project must be **newly created during the contest period** (May 5 → June 11, 2026) and original — not an extension of prior work. | Rules §Submission |
| 7 | **Public repo**, **OSI-approved license** (commercial use must be allowed), **hosted URL**, **≤3 min video** with English/subtitles. | Rules §Submission Components |
| 8 | All deliverables on Devpost by **June 11, 2026, 2:00 PM PT**. | Rules §Contest Period |

---

## Countdown (today = 2026-05-06)

| Date | Days from now | What |
| ---- | ------------- | ---- |
| 2026-06-04 | **+29** | Last day to request the **$100 GCP credit** (1–5 biz day approval) |
| 2026-06-11 | **+36** | **Submission deadline 2pm PT** |
| 2026-06-22 | +47 | Judging starts |
| 2026-07-06 | +61 | Judging ends |
| 2026-07-07 | +62 | Winners notified |

---

## Track Comparison

|                            | **Arize** (observability)                    | **Elastic** (search/RAG)             | **Fivetran** (data integration)       |
| -------------------------- | -------------------------------------------- | ------------------------------------ | -------------------------------------- |
| MCP server status          | Published, documented                        | **"Coming soon…"** as of 2026-05-06  | Published (open source, forkable)      |
| Track-specific criteria    | **Yes** (tracing, MCP use, self-improvement loop, impact) | Not yet published                    | Not specified (default 4 criteria)     |
| Free tier                  | Phoenix Cloud free                           | Elastic Cloud trial                  | 14-day trial                           |
| Best fit                   | Agents with eval / self-correction / metrics | Agents that retrieve over corpora    | Agents over multi-SaaS data in BigQuery|
| Setup risk                 | Low                                          | **High** — spec not finalized        | Low (just trial timing)                |
| Differentiation potential  | High — most teams skip observability         | Unclear until criteria publish       | Medium — many obvious data agents      |

**Provisional recommendation**: **Arize** unless WhyC's domain inherently demands rich retrieval (→ Elastic, accept spec risk) or multi-SaaS data extraction (→ Fivetran). Final pick depends on what WhyC actually does — pending user brief.

---

## Scoring Levers (what judges actually score)

Equal weight across the 4 criteria:

1. **Technological Implementation** — clean, idiomatic use of GCP + Partner. Avoid "calling LLM in a loop" patterns; show real Agent Builder / ADK / extension wiring. Logs, evals, and proper error paths matter.
2. **Design** — UX is judged on a 3-min video. The hosted demo must feel finished. Mobile-friendly responsive web is the cheapest way to satisfy "at least one of: web, Android, iOS."
3. **Potential Impact** — connect to a concrete user / community / problem. Quantify when possible (time saved, users reached, $ implication).
4. **Quality of the Idea** — uniqueness. The 2,437-participant gallery is a benchmark — check it before locking the concept.

**Arize-only bonus criterion**: self-improvement loop. If we pick Arize, design this into the MVP from day 1, not as an add-on.

---

## Architecture Defaults (subject to WhyC's actual scope)

```
┌──────────────┐    ┌─────────────────────┐    ┌──────────────────┐
│  Web client  │───▶│  Cloud Run /        │───▶│ Vertex AI Gemini │
│ (Next.js?)   │    │  Reasoning Engine   │    │  (model)         │
│              │    │  (agent backbone)   │    │                  │
└──────────────┘    └──────────┬──────────┘    └──────────────────┘
                               │
                ┌──────────────┼──────────────┐
                ▼              ▼              ▼
       ┌──────────────┐ ┌─────────────┐ ┌────────────────┐
       │ Partner MCP  │ │ Vertex AI   │ │ Secret Manager │
       │ (Arize/      │ │ Extensions  │ │ (API keys)     │
       │  Elastic/    │ │ (tools)     │ │                │
       │  Fivetran)   │ │             │ │                │
       └──────────────┘ └─────────────┘ └────────────────┘
```

- **Frontend**: Next.js or similar; deploy to Vercel **only if** that's not deemed competitive with Cloud Run (it isn't — Vercel hosts the UI, not the agent). Safer: Cloud Run + Firebase Hosting / static export.
- **Agent runtime**: Cloud Run (HTTP) or Vertex AI Reasoning Engine. ADK is the SDK choice for Arize track.
- **Persistence**: Firestore / Cloud SQL / BigQuery — pick one based on data shape.
- **Auth**: Firebase Auth or Identity Platform.
- **Observability**: required for Arize track; useful regardless.
- **Repo**: GitHub, **MIT** or **Apache-2.0** license file at root (visible in About panel).

---

## What's NOT Allowed (sharp edges)

- ❌ Building on top of an **existing project** (even your own)
- ❌ Using **OpenAI / Anthropic / xAI** APIs as the agent model
- ❌ Using **AWS Bedrock / Azure AI** as the runtime
- ❌ If Elastic track: replacing Elastic with another vector DB (Pinecone, Weaviate) for the core search
- ❌ If Arize track: relying purely on visual Agent Builder (must instrument code)
- ❌ Restrictive licenses that limit commercial use (some "source-available" licenses fail OSI test)
- ❌ Brand/trademark/third-party promo in the demo video
- ❌ Modifications to the submission **after** the deadline (limited exceptions only)

---

## Pre-Submission Checklist

- [ ] Devpost account created and registered for hackathon
- [ ] Google Cloud project created
- [ ] $100 credit requested by **2026-06-04**
- [ ] Track chosen (Arize / Elastic / Fivetran) and committed
- [ ] Public GitHub repo with **OSI license file** at root
- [ ] Hosted demo URL (functional, accessible without login or with provided test creds)
- [ ] ≤3 min demo video on YouTube/Vimeo, English subtitles
- [ ] Devpost form: features, tech stack, data sources, learnings
- [ ] Final submission committed before **2026-06-11 14:00 PT**

---

## Open Questions (waiting on user brief)

1. **What does WhyC actually do?** (Domain, target user, the "task" the agent performs.)
2. **Solo or team?** (≤4 members; need a Representative if team.)
3. **Korean-language UI / multilingual?** (No restriction in rules, but the demo video must be English-or-subtitled.)
4. **Track preference?** (Or should we pick based on the brief?)
5. **Existing prototype to discard?** (Rules require new work — anything pre-existing must not be carried in.)
