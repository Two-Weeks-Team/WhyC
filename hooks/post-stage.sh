#!/usr/bin/env bash
# post-stage hook — runs AFTER every pipeline stage body.
#
# Usage: hooks/post-stage.sh <run_dir> <stage> <output_json_file> [trace_id] [cost_cents_cumulative]
#
# Actions:
#   1. validate output file is valid JSON (refuse transition otherwise)
#   2. compute SHA-256 of the canonical output file
#   3. append a manifest line to <run_dir>/manifest.jsonl  (replayable record)
#   4. append a decision line to <run_dir>/memory/decisions.md (correlated)
#
# Prints the manifest line to stdout. Exits 0 on success.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=hooks/_lib.sh
source "$HERE/_lib.sh"

RUN_DIR="${1:?run_dir required}"
STAGE="${2:?stage required}"
OUTPUT="${3:?output_json_file required}"
TRACE_ID="${4:-null}"
COST_CUM="${5:-0}"

[ -f "$OUTPUT" ] || hfail "output file not found: $OUTPUT"
json_valid "$OUTPUT" || hfail "stage $STAGE produced invalid JSON output"

STATE="$(run_state_file "$RUN_DIR")"
RUN_ID="$(json_get "$STATE" run_id "unknown-run")"
ITER_ID="$(json_get "$STATE" iteration_id "unknown-iter")"
TS="$(now_iso)"
OUT_SHA="$(sha256_of_file "$OUTPUT")"

# manifest line (matches ManifestLine in apps/jobs/src/pipeline/types.ts)
LINE=$(python3 - "$RUN_ID" "$ITER_ID" "$STAGE" "$TS" "$OUT_SHA" "$TRACE_ID" "$COST_CUM" <<'PY'
import json, sys
run_id, iter_id, stage, ts, sha, trace, cost = sys.argv[1:8]
print(json.dumps({
    "run_id": run_id,
    "iteration_id": iter_id,
    "stage": stage,
    "ts": ts,
    "output_sha256": sha,
    "trace_id": None if trace in ("null", "", "None") else trace,
    "cost_cents_cumulative": int(cost) if str(cost).lstrip("-").isdigit() else 0,
}))
PY
)

append_line "$RUN_DIR/manifest.jsonl" "$LINE"
append_line "$RUN_DIR/memory/decisions.md" "[$RUN_ID] [$TS] stage=$STAGE output_sha256=$OUT_SHA trace=$TRACE_ID"

hlog "post-stage OK: stage=$STAGE sha=$OUT_SHA"
echo "$LINE"
