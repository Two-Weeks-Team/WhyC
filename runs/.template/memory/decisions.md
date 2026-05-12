# Contract decisions (template) — append-only

Every line: `[correlation_id] [timestamp] decision`

The correlation_id is the run id, so this log can be cross-referenced with
`manifest.jsonl`, the Phoenix traces, and `patterns.md`. Written by the
`post-stage.sh` / `pre-deploy.sh` / `category-gate-security.py` hooks.
