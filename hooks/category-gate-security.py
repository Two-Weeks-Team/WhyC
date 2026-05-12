#!/usr/bin/env python3
"""category-gate-security hook — runs AFTER the Stage 5 judge panel.

Usage:
    hooks/category-gate-security.py <run_dir> <judge_output_json_file>

The judge output is a JudgePanelOutput (apps/jobs/src/pipeline/types.ts). If
ANY critic raised `security_flag` (or the top-level `any_security_flag` is
true), this gate fires:

    exit 2  → escalate: the orchestrator routes to the mitigation step
              before allowing the run to converge or deploy.
    exit 0  → clear: no security concern, proceed.
    exit 1  → malformed input (treated as a hard failure).

A line is appended to <run_dir>/memory/decisions.md either way. Stdlib only.
"""
import datetime
import json
import os
import sys


def now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def main() -> int:
    if len(sys.argv) < 3:
        print("category-gate-security.py: missing args", file=sys.stderr)
        return 1
    run_dir, judge_file = sys.argv[1], sys.argv[2]
    try:
        judge = json.load(open(judge_file, encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"category-gate-security.py: cannot read judge output: {exc}", file=sys.stderr)
        return 1

    critics = judge.get("critics", []) if isinstance(judge, dict) else []
    flagged = [c.get("critic", "?") for c in critics if isinstance(c, dict) and c.get("security_flag")]
    any_flag = bool(judge.get("any_security_flag")) or bool(flagged)

    run_id = "unknown-run"
    state_path = os.path.join(run_dir, "run-state.json")
    if os.path.isfile(state_path):
        try:
            run_id = json.load(open(state_path, encoding="utf-8")).get("run_id", run_id)
        except (json.JSONDecodeError, OSError):
            pass

    decisions = os.path.join(run_dir, "memory", "decisions.md")
    os.makedirs(os.path.dirname(decisions), exist_ok=True)
    verdict = f"ESCALATE (critics: {','.join(flagged) or 'top-level flag'})" if any_flag else "CLEAR"
    with open(decisions, "a", encoding="utf-8") as fh:
        fh.write(f"[{run_id}] [{now_iso()}] SECURITY-GATE {verdict}\n")

    if any_flag:
        print(json.dumps({"gate": "security", "result": "escalate", "flagged_critics": flagged}))
        return 2
    print(json.dumps({"gate": "security", "result": "clear"}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
