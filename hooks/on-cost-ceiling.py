#!/usr/bin/env python3
"""on-cost-ceiling hook — invoked when total_cost_cents crosses 80% of the limit.

Usage:
    hooks/on-cost-ceiling.py <run_dir> <total_cost_cents> <cost_limit_cents>

Decision (printed as JSON on stdout):
    {"action": "continue"}                 # < 80% — shouldn't normally be called
    {"action": "downgrade", "mode": "single_advocate"}  # 80%..<100% — shrink fan-out
    {"action": "abort", "reason": "..."}   # >= 100% — terminal ceiling_hit

Also appends a warning line to <run_dir>/memory/patterns.md and (if present)
flips run-state.json's "advocate_mode" to "single" on downgrade so the next
iteration's multi-analyzer / multi-developer run with one advocate instead of
3/5. Stdlib only. Exits 0 (decision is in stdout).
"""
import datetime
import json
import os
import sys


def now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def main() -> int:
    if len(sys.argv) < 4:
        print(json.dumps({"action": "abort", "reason": "on-cost-ceiling.py: missing args"}))
        return 0
    run_dir = sys.argv[1]
    try:
        total = int(sys.argv[2])
        limit = int(sys.argv[3])
    except ValueError:
        print(json.dumps({"action": "abort", "reason": "on-cost-ceiling.py: non-int args"}))
        return 0
    if limit <= 0:
        print(json.dumps({"action": "abort", "reason": "cost_limit_cents <= 0"}))
        return 0

    pct = total / limit
    if pct >= 1.0:
        decision = {"action": "abort", "reason": f"cost ceiling hit ({total}/{limit}c = {pct:.0%})"}
    elif pct >= 0.8:
        decision = {"action": "downgrade", "mode": "single_advocate"}
    else:
        decision = {"action": "continue"}

    run_id = "unknown-run"
    state_path = os.path.join(run_dir, "run-state.json")
    if os.path.isfile(state_path):
        try:
            state = json.load(open(state_path, encoding="utf-8"))
            run_id = state.get("run_id", run_id)
            if decision["action"] == "downgrade":
                state["advocate_mode"] = "single"
                tmp = state_path + ".tmp"
                with open(tmp, "w", encoding="utf-8") as fh:
                    json.dump(state, fh, indent=2)
                os.replace(tmp, state_path)
        except (json.JSONDecodeError, OSError):
            pass

    patterns = os.path.join(run_dir, "memory", "patterns.md")
    os.makedirs(os.path.dirname(patterns), exist_ok=True)
    with open(patterns, "a", encoding="utf-8") as fh:
        fh.write(f"[{run_id}] [{now_iso()}] COST {total}/{limit}c ({pct:.0%}) -> {decision['action']}\n")

    print(json.dumps(decision))
    return 0


if __name__ == "__main__":
    sys.exit(main())
