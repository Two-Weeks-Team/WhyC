# Dataset Verification Protocol

**Status**: protocol defined · dataset NOT yet verified · placeholder seed in `prisma/seed.ts`.
**Owner**: Sejun Kim · `centisgood@gmail.com`
**Target completion**: WK3 (2026-05-21 → 2026-05-27)

This document is the gate every YC company must pass before being inserted into the production dataset that ships in the demo + judging window. The current `prisma/seed.ts` contains 12 alphabetical placeholder rows tagged `(TBD)`; they exist only to validate the schema, repository queries, and N+1 contract.

---

## Why this matters

H1 locked the decision to use **real Y Combinator company names** in the live demo (text-only, no logos). Hackathon rules permit this under nominative fair use as long as content stays factual, non-disparaging, and avoids trademarks/logos. **One falsifiable claim or one mis-attributed company breaks Stage-1 and there is no second submission window.**

This protocol exists so we can defend every line of the dataset to a Stage-1 reviewer in writing.

---

## The seven checks (per company, all must pass)

For each candidate company `<slug>`, the operator must verify and record evidence in `data/dataset-evidence.jsonl` (one JSON line per company, append-only).

### Check 1 — YC batch listing
- Navigate to the public YC batch page for the candidate's batch (`W25` / `S25` / `W26`).
- Confirm the company appears on that page.
- Capture: page URL + access timestamp + screenshot path.

### Check 2 — workatastartup.com presence
- The company's profile URL must resolve (`https://www.workatastartup.com/companies/<slug>`).
- The slug we use in our DB must match the slug on workatastartup.com (lowercase, hyphenated).
- If the slug is non-ASCII or contains characters outside `^[a-z0-9][a-z0-9-]{0,63}$`, the company is excluded.

### Check 3 — Description sourced from public page
- `Company.description.text` must be a verbatim quote (or close paraphrase, ≤200 words) from the company's public landing on workatastartup.com or its own homepage.
- `Company.description.source_url` must dereference to that exact page on the access date.
- `Company.description.language` must be set (`en` for the v1 dataset).

### Check 4 — Hires posted count is verifiable
- Visit the company's `/jobs` listing on workatastartup.com.
- Count engineering / SWE / intern roles with status = open.
- Record the count + access timestamp. The number must be derivable from the public page; if the page is gated, exclude the company.

### Check 5 — No takedown request on file
- Email `abuse@whyc.dev` (forwarding to `centisgood@gmail.com`) must show no prior takedown request from the company or its representatives.
- Re-check at T-3 days before submission.

### Check 6 — No defamatory framing risk
- The dashboard row, project-detail page, and any text the company appears in must use **only** factual receipt-style language — numbers and dates. Rejected phrasings:
  - "Company X cannot ship"
  - "Company X is failing"
  - "Company X's CEO is incompetent"
  - "Company X took fundraising and disappeared"
- Acceptable phrasings:
  - "Company X · YC W26 · Demo Day 2026-03-15 · Hires posted (current): 14 · Days since DD: 53 · Product launched: —"
  - "Company X has 14 engineering roles open as of 2026-05-07."
- Each company's rendered text is reviewed against this list.

### Check 7 — IP / copyright in generated preview
- The WhyC pipeline-generated preview must NOT reproduce the company's actual product UI verbatim. The preview is an *inferred* implementation of the company's pitched product hypothesis — different visual identity, no copying of screenshots, no logo pulls.
- If the generator emits HTML containing the company's name as a logo or any rendered artifact that could be mistaken for the company's official UI, the preview fails this check and is regenerated.
- The output Cloud Run URL (`whyc-preview-<run_id>.run.app`) carries our domain, not the company's brand.

---

## Evidence file format

`data/dataset-evidence.jsonl` (gitignored — contains URLs and timestamps; not committed):

```jsonl
{"slug":"acme-w26","name":"Acme Robotics","batch":"W26","checks":{"yc_batch":{"pass":true,"url":"https://www.ycombinator.com/companies?batch=W2026","ts":"2026-05-21T..."},"was_present":{"pass":true,"slug_match":true,"url":"https://www.workatastartup.com/companies/acme-w26","ts":"..."},"description":{"pass":true,"source_url":"https://www.workatastartup.com/companies/acme-w26","quote_length":174,"language":"en"},"hires_posted":{"pass":true,"count":14,"jobs_url":"https://www.workatastartup.com/companies/acme-w26/jobs","ts":"..."},"takedown":{"pass":true,"checked_ts":"..."},"framing":{"pass":true,"reviewed_ts":"..."},"ip_safety":{"pass":true,"preview_run_id":"...","reviewed_ts":"..."}}}
```

A company is admitted to production seed only when all seven `pass: true`. Append-only (no deletions; if a company fails later, append a `revoke` event).

---

## Re-verification cadence

- Once per week through hackathon period.
- T-7 days before submission: full re-check of all 12.
- T-3 days before submission: takedown email re-check + framing re-review.
- T-1 day before submission: hire counts refresh.

---

## Replacement policy

If a company:
- Receives a takedown request → status flipped to `removed`, dashboard returns `410 Gone` per spec, replaced with the next candidate from the reserve list.
- Launches a real product (publicly verifiable) → status flipped to `launched_and_excluded`, replaced. The thesis no longer applies.
- Fails any check at T-7 → replaced.

The reserve list is 6 additional candidates beyond the 12 — to be identified during initial scrape.

---

## What is NOT a violation (explicit allowlist)

These are pre-cleared as fair use under hackathon rules:

- "Y Combinator", "YC", batch labels (W25, S25, W26) as text — nominative fair use for commentary.
- Company names as text in our typography — fair use.
- workatastartup.com URLs as citations — public information.
- Comparison receipts ("X took N days, WhyC took M minutes") — factual, public-data derived.
- Footer disclaimer (M4 supersede) covering the dataset.

These remain forbidden:

- Any company logo (image, SVG, embedded copy).
- YC official wordmark / "Y" mark / orange brand color used as endorsement.
- Quotes from private sources (Slack, internal email, paid services).
- Statements about specific persons (founders, employees, investors).
- Adjectives implying failure, incompetence, fraud, or deception.

---

## How to start the verification

1. Identify candidate companies (~30 from W25/S25/W26 batches).
2. For each, run the seven checks in order. Stop at the first failure and move on.
3. Admit the first 12 that pass all seven into `data/dataset-verified.json` (also gitignored — staging file).
4. Engineer-on-duty converts `data/dataset-verified.json` to a SQL update against the production DB during the deploy window.
5. The current placeholder rows (`tbd-w26-01` … `tbd-w25-12`) are deleted in the same migration.

The placeholder seed continues to ship to dev / CI environments unchanged.
