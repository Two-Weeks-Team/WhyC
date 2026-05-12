# Patterns: retries, failures, convergence (template) — append-only

Every line: `[correlation_id] [timestamp] event ...`

Events:
- `FAIL stage=… code=… retry=n/m retriable=… -> action`   (on-fail.py)
- `COST total/limit (pct%) -> action`                       (on-cost-ceiling.py)
- `CONVERGED spec_fit=… iters=… cost=…c hard_flow=…`        (on-converge.py)

This file is the seed corpus for the Phase 9 BigQuery learning import
(`whyc_learning.run_outcomes`). One row per terminated run, plus the
retry/cost lines for diagnostics.
