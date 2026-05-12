#!/usr/bin/env bash
# Phase 0.5 build gate — invoke all seven hooks on placeholder data and assert
# the expected exit codes. Zero external deps beyond bash + python3 + shasum.
#
#   bash hooks/smoke-test.sh
#
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
RUN_DIR="$WORK/r-smoke"
mkdir -p "$RUN_DIR/memory"
cp "$ROOT/runs/.template/run-state.json" "$RUN_DIR/run-state.json"
cp "$ROOT/runs/.template/memory/"*.md "$RUN_DIR/memory/"

# normalise placeholder ids so manifest lines are deterministic-ish
python3 - "$RUN_DIR/run-state.json" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d["run_id"] = "r-smoke"
d["iteration_id"] = "iter-smoke-0"
json.dump(d, open(p, "w"), indent=2)
PY

# placeholder stage IO
echo '{"source_url":"https://example.com","body":"hi","content_sha256":"deadbeef","strip_report":{"html_removed":false,"unicode_normalized":false,"length_in":2,"length_out":2}}' > "$WORK/analyze-in.json"
echo '{"pitch":"p","persona":"u","jtbd_functional":"j","flows":[],"surface":"web","constraints":{"regulated_domain":false,"hardware_bound":false,"stealth":false}}' > "$WORK/analyze-out.json"
echo '{"artifact_sha256":"abc","artifact_gcs_uri":"gs://x","per_flow":[],"cost_cents":1}' > "$RUN_DIR/develop-winner.json"
echo '{"judge_prompt_version":"v1","axes":[],"spec_fit":0.9,"weakest_flow":"global","trace_id":"t1","critics":[{"critic":"security","axes":[],"spec_fit":0.9,"security_flag":false,"trace_id":"t1","rationale":"ok"}],"critic_weights":{"pitch_alignment":0.2,"flows_present":0.2,"design_quality":0.2,"implementation":0.2,"security":0.2},"any_security_flag":false}' > "$WORK/judge-clean.json"
echo '{"judge_prompt_version":"v1","axes":[],"spec_fit":0.9,"weakest_flow":"global","trace_id":"t2","critics":[{"critic":"security","axes":[],"spec_fit":0.4,"security_flag":true,"trace_id":"t2","rationale":"leaks API key"}],"critic_weights":{"pitch_alignment":0.2,"flows_present":0.2,"design_quality":0.2,"implementation":0.2,"security":0.2},"any_security_flag":true}' > "$WORK/judge-flagged.json"

# portable sha256 (shasum may be absent — e.g. slim Docker images have only sha256sum)
sha256_file() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else echo "no shasum/sha256sum" >&2; return 1; fi
}

pass=0; fail=0
expect() { # expect <expected_code> <label> -- <cmd...>
  local exp="$1" label="$2"; shift 3
  local got=0
  "$@" >/dev/null 2>&1 || got=$?
  if [ "$got" -eq "$exp" ]; then echo "✓ $label (exit $got)"; pass=$((pass+1));
  else echo "✗ $label — expected exit $exp, got $got"; fail=$((fail+1)); fi
}

expect 0 "pre-stage (analyze)"        -- bash "$HERE/pre-stage.sh"  "$RUN_DIR" analyze "$WORK/analyze-in.json"
expect 0 "post-stage (analyze)"       -- bash "$HERE/post-stage.sh" "$RUN_DIR" analyze "$WORK/analyze-out.json" trace-abc 42
expect 0 "on-fail (retriable, budget left)" -- python3 "$HERE/on-fail.py" "$RUN_DIR" develop transient_5xx 0 2 true
expect 0 "on-fail (retriable, exhausted)"   -- python3 "$HERE/on-fail.py" "$RUN_DIR" develop transient_5xx 2 2 true
expect 0 "on-fail (non-retriable)"          -- python3 "$HERE/on-fail.py" "$RUN_DIR" analyze sanitizer.sentinel_in_input 0 2 false
expect 0 "on-converge"                -- python3 "$HERE/on-converge.py" "$RUN_DIR" r-smoke 0.94 3 81 template-co dashboard
expect 0 "on-cost-ceiling (continue, 0%)"   -- python3 "$HERE/on-cost-ceiling.py" "$RUN_DIR" 0 500
expect 0 "on-cost-ceiling (downgrade, 80%)" -- python3 "$HERE/on-cost-ceiling.py" "$RUN_DIR" 400 500
expect 0 "on-cost-ceiling (abort, 100%)"    -- python3 "$HERE/on-cost-ceiling.py" "$RUN_DIR" 500 500
expect 0 "pre-deploy (matching sha)"  -- bash "$HERE/pre-deploy.sh" "$RUN_DIR" "$(sha256_file "$RUN_DIR/develop-winner.json")"
expect 1 "pre-deploy (tampered sha)"  -- bash "$HERE/pre-deploy.sh" "$RUN_DIR" "0000000000000000000000000000000000000000000000000000000000000000"
expect 0 "category-gate-security (clean)"   -- python3 "$HERE/category-gate-security.py" "$RUN_DIR" "$WORK/judge-clean.json"
expect 2 "category-gate-security (flagged)" -- python3 "$HERE/category-gate-security.py" "$RUN_DIR" "$WORK/judge-flagged.json"

# sanity: the post-stage hook actually wrote a manifest line
if [ -s "$RUN_DIR/manifest.jsonl" ] && python3 -c 'import json,sys; [json.loads(l) for l in open(sys.argv[1]) if l.strip()]' "$RUN_DIR/manifest.jsonl"; then
  echo "✓ manifest.jsonl written and valid"
  pass=$((pass+1))
else
  echo "✗ manifest.jsonl missing or invalid"
  fail=$((fail+1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
