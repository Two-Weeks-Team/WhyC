---
run_id: r-TEMPLATE
company_slug: template-co
status: scaffold
started_at: ""
last_stage: ""
iter: 0
---

# Run session handoff (template)

This file is the *running* state of one pipeline run — the cross-iteration
memory the v4 hook layer keeps so a judge (or a replay) can reconstruct
exactly what happened, in order.

`apps/jobs/src/util/memory.ts` rewrites the frontmatter after every stage and
appends one line to the log below. The two sibling files in this directory —
`decisions.md` (every contract decision, correlated) and `patterns.md`
(retry / failure / convergence lessons) — are append-only.

## Stage log

<!-- one line per completed stage: [stage] [ts] [output_sha256] [trace_id] -->
