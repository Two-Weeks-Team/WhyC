#!/usr/bin/env bash
# Shared helpers for the WhyC v4 hook layer.
#
# Design constraint: ZERO runtime dependencies beyond a POSIX shell, python3
# (stdlib only, for JSON parsing), and one of shasum/sha256sum. No jq, no ajv,
# no npm packages. Judges grep hooks/ and see plain scripts.
set -euo pipefail

# --- logging -----------------------------------------------------------------
hlog()  { printf '[hook] %s\n' "$*" >&2; }
hfail() { printf '[hook] FAIL: %s\n' "$*" >&2; exit 1; }

# --- sha256 (portable) -------------------------------------------------------
sha256_of_file() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else hfail "no shasum/sha256sum available"; fi
}
sha256_of_string() {
  if command -v shasum >/dev/null 2>&1; then printf '%s' "$1" | shasum -a 256 | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then printf '%s' "$1" | sha256sum | awk '{print $1}'
  else hfail "no shasum/sha256sum available"; fi
}

# --- JSON (python3 stdlib) ---------------------------------------------------
# validate that a file is parseable JSON; exit non-zero otherwise
json_valid() { python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$1"; }
# extract a top-level (or dotted) key: json_get <file> <dotted.path> [default]
json_get() {
  python3 - "$1" "$2" "${3-}" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
path, default = sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else "")
cur = data
for part in path.split("."):
    if isinstance(cur, dict) and part in cur:
        cur = cur[part]
    else:
        print(default); sys.exit(0)
print(cur if not isinstance(cur, (dict, list)) else json.dumps(cur))
PY
}

# --- timestamps --------------------------------------------------------------
now_iso() { python3 -c 'import datetime; print(datetime.datetime.now(datetime.timezone.utc).isoformat())'; }

# --- atomic append (write + flush; rename not needed for append) -------------
append_line() { # append_line <file> <line>
  mkdir -p "$(dirname "$1")"
  printf '%s\n' "$2" >> "$1"
}

# --- run-state accessors -----------------------------------------------------
# A run dir has: run-state.json {run_id,total_cost_cents,cost_limit_cents,iter,iter_limit}
run_state_file() { echo "$1/run-state.json"; }
