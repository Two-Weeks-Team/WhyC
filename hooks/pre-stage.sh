#!/usr/bin/env bash
# pre-stage hook — gate that runs BEFORE every pipeline stage body.
#
# Usage: hooks/pre-stage.sh <run_dir> <stage> <input_json_file>
#
# Checks (any failure → exit 1, stage transition refused):
#   1. input file exists and is valid JSON
#   2. run-state.json present and parseable
#   3. budget headroom: total_cost_cents < cost_limit_cents
#   4. iteration headroom: iter <= iter_limit
#
# On success prints "OK <stage>" and exits 0. Designed to exit 0 on the
# placeholder fixtures under runs/.template/ so the Phase 0.5 build gate passes.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=hooks/_lib.sh
source "$HERE/_lib.sh"

RUN_DIR="${1:?run_dir required}"
STAGE="${2:?stage required}"
INPUT="${3:?input_json_file required}"

[ -f "$INPUT" ] || hfail "input file not found: $INPUT"
json_valid "$INPUT" || hfail "input is not valid JSON: $INPUT"

STATE="$(run_state_file "$RUN_DIR")"
[ -f "$STATE" ] || hfail "run-state.json not found in $RUN_DIR"
json_valid "$STATE" || hfail "run-state.json is not valid JSON"

TOTAL="$(json_get "$STATE" total_cost_cents 0)"
LIMIT="$(json_get "$STATE" cost_limit_cents 9999)"
ITER="$(json_get "$STATE" iter 0)"
ITER_LIMIT="$(json_get "$STATE" iter_limit 7)"

if [ "$TOTAL" -ge "$LIMIT" ]; then
  hlog "budget exhausted ($TOTAL >= $LIMIT cents) — refusing stage $STAGE"
  exit 1
fi
if [ "$ITER" -gt "$ITER_LIMIT" ]; then
  hlog "iteration limit exceeded ($ITER > $ITER_LIMIT) — refusing stage $STAGE"
  exit 1
fi

hlog "pre-stage OK: stage=$STAGE budget=$TOTAL/$LIMIT iter=$ITER/$ITER_LIMIT"
echo "OK $STAGE"
