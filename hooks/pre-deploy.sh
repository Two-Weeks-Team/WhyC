#!/usr/bin/env bash
# pre-deploy hook — runs BEFORE Cloud Build of Stage 4.
#
# Usage: hooks/pre-deploy.sh <run_dir> <expected_manifest_sha256> [manifest_file]
#
# Re-verifies that the winner manifest the deployer is about to ship still
# hashes to exactly what Stage 3 (multi-developer) recorded. If it doesn't,
# something tampered with the artifact between develop and deploy → refuse
# (exit 1) so we never deploy an unattested build.
#
# manifest_file defaults to <run_dir>/develop-winner.json.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=hooks/_lib.sh
source "$HERE/_lib.sh"

RUN_DIR="${1:?run_dir required}"
EXPECTED="${2:?expected_manifest_sha256 required}"
MANIFEST="${3:-$RUN_DIR/develop-winner.json}"

[ -f "$MANIFEST" ] || hfail "winner manifest not found: $MANIFEST"
json_valid "$MANIFEST" || hfail "winner manifest is not valid JSON: $MANIFEST"

ACTUAL="$(sha256_of_file "$MANIFEST")"
if [ "$ACTUAL" != "$EXPECTED" ]; then
  hlog "MANIFEST TAMPER: expected=$EXPECTED actual=$ACTUAL — refusing deploy"
  exit 1
fi

# Record the attested deploy intent.
RUN_ID="$(json_get "$(run_state_file "$RUN_DIR")" run_id "unknown-run")"
append_line "$RUN_DIR/memory/decisions.md" "[$RUN_ID] [$(now_iso)] PRE-DEPLOY OK manifest_sha256=$ACTUAL"
hlog "pre-deploy OK: manifest_sha256=$ACTUAL"
echo "OK $ACTUAL"
