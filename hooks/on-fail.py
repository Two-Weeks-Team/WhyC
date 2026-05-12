#!/usr/bin/env python3
"""on-fail hook — invoked when a pipeline stage body raises a StageError.

Usage:
    hooks/on-fail.py <run_dir> <stage> <error_code> <retry_count> <max_retries> [retriable]

Decides what the retry-with-budget framework (apps/jobs/src/util/retry.ts)
should do next, appends a correlated line to <run_dir>/memory/patterns.md
(consumed later by the Phase 9 BigQuery learning import), and prints the
decision as JSON on stdout:

    {"action": "retry"   , "attempt": N}      # try again
    {"action": "ceiling_hit", "reason": "..."}# give up this run, terminal
    {"action": "abort"   , "reason": "..."}   # hard non-retriable failure

Stdlib only. Always exits 0 — the *decision* is in stdout, not the exit code,
so the caller can act on it deterministically.
"""
import datetime
import json
import os
import sys


def now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def append_line(path: str, line: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def main() -> int:
    if len(sys.argv) < 6:
        print(json.dumps({"action": "abort", "reason": "on-fail.py: missing args"}))
        return 0
    run_dir, stage, code = sys.argv[1], sys.argv[2], sys.argv[3]
    try:
        retry_count = int(sys.argv[4])
        max_retries = int(sys.argv[5])
    except ValueError:
        print(json.dumps({"action": "abort", "reason": "on-fail.py: non-int retry args"}))
        return 0
    retriable = (sys.argv[6].lower() in ("1", "true", "yes")) if len(sys.argv) > 6 else True

    run_id = "unknown-run"
    state_path = os.path.join(run_dir, "run-state.json")
    if os.path.isfile(state_path):
        try:
            run_id = json.load(open(state_path, encoding="utf-8")).get("run_id", run_id)
        except (json.JSONDecodeError, OSError):
            pass

    if not retriable:
        decision = {"action": "abort", "reason": f"non-retriable StageError {code} in {stage}"}
    elif retry_count >= max_retries:
        decision = {"action": "ceiling_hit", "reason": f"retry budget exhausted ({retry_count}/{max_retries}) on {stage}:{code}"}
    else:
        decision = {"action": "retry", "attempt": retry_count + 1}

    append_line(
        os.path.join(run_dir, "memory", "patterns.md"),
        f"[{run_id}] [{now_iso()}] FAIL stage={stage} code={code} "
        f"retry={retry_count}/{max_retries} retriable={retriable} -> {decision['action']}",
    )
    print(json.dumps(decision))
    return 0


if __name__ == "__main__":
    sys.exit(main())
