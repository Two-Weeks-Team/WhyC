# `hooks/` — WhyC v4 mechanical stage gates

These seven scripts wrap every pipeline stage. The TypeScript pipeline shells
out to them (`apps/jobs/src/util/memory.ts → runHook()`); a non-zero exit
**refuses the stage transition**. They are deliberately written in plain bash
and stdlib Python — **zero runtime dependencies** (no `jq`, no `ajv`, no npm
packages). The only externals are a POSIX shell, `python3`, and one of
`shasum` / `sha256sum`. Reviewers grep `hooks/`, they see scripts; there is no
hidden behaviour buried in LLM prompts.

| Hook | When | Effect |
| --- | --- | --- |
| `pre-stage.sh <run_dir> <stage> <input.json>` | before every stage body | input is valid JSON · `run-state.json` parseable · `total_cost_cents < cost_limit_cents` · `iter ≤ iter_limit` → else exit 1 |
| `post-stage.sh <run_dir> <stage> <output.json> [trace_id] [cost_cum]` | after every stage body | output is valid JSON → SHA-256 it → append a `ManifestLine` to `manifest.jsonl` + a correlated line to `memory/decisions.md` |
| `on-fail.py <run_dir> <stage> <code> <retry_count> <max_retries> [retriable]` | stage body raised `StageError` | decide `retry` / `ceiling_hit` / `abort` (prints JSON) · append to `memory/patterns.md` |
| `on-converge.py <run_dir> <run_id> <spec_fit> [iters] [cost] [slug] [hard_flow]` | `decideNext().kind == 'converged'` | write `run-outcome.json` (`RunOutcomeRow`) · append to `patterns.md` · print follow-up checklist (BQ insert / screenshots / Phoenix annotate — done by the TS caller only when GCP env present) |
| `on-cost-ceiling.py <run_dir> <total_cents> <limit_cents>` | `total_cost_cents` ≥ 80 % of limit | ≥ 100 % → `abort` · 80–100 % → `downgrade` (flips `run-state.json` `advocate_mode → single`) · prints JSON |
| `pre-deploy.sh <run_dir> <expected_manifest_sha256> [manifest_file]` | before Cloud Build of Stage 4 | re-hash the winner manifest; if it ≠ what Stage 3 recorded → exit 1 (never deploy an unattested build) |
| `category-gate-security.py <run_dir> <judge_output.json>` | after the Stage 5 judge panel | any critic `security_flag` → exit 2 (escalate to mitigation) · else exit 0 |

Shared helpers live in `_lib.sh` (sourced by the `.sh` hooks).

## Per-run files the hooks read / write

A run directory (`runs/<run_id>/`) is seeded from [`runs/.template/`](../runs/.template/):

```
runs/<run_id>/
  run-state.json            # {run_id, iteration_id, iter, iter_limit, total_cost_cents, cost_limit_cents, advocate_mode, …}
  manifest.jsonl            # append-only ManifestLine per completed stage (replayable)
  run-outcome.json          # written by on-converge.py — the BigQuery row
  develop-winner.json       # the winning manifest (pre-deploy.sh re-hashes this)
  memory/
    session-handoff.md      # cross-iteration running state (frontmatter rewritten each stage)
    decisions.md            # append-only: every contract decision, correlated by run_id
    patterns.md             # append-only: retries / failures / convergence — Phase 9 BQ seed
```

## Smoke test

[`smoke-test.sh`](./smoke-test.sh) builds a throwaway run dir from the template,
invokes all seven hooks on placeholder data, and asserts the expected exit
codes (including the deliberate `exit 2` from the security gate). It is the
Phase 0.5 build gate and runs in CI (`hooks` job in `.github/workflows/ci.yml`).

```bash
bash hooks/smoke-test.sh
```
