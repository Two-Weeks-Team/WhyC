#!/usr/bin/env python3
"""on-converge hook — invoked when decideNext().kind == 'converged'.

Usage:
    hooks/on-converge.py <run_dir> <run_id> <final_spec_fit> [iterations] [cost_cents] [company_slug] [hard_flow]

Records the convergence in <run_dir>/memory/patterns.md and writes a
BigQuery-shaped row to <run_dir>/run-outcome.json (matches RunOutcomeRow in
apps/jobs/src/pipeline/types.ts). The actual BigQuery insert / screenshot
capture / Phoenix annotation / Cloud Tasks notify are performed by the
TypeScript caller IF the GCP env is configured — this hook just produces the
canonical record and prints the follow-up checklist on stdout. No GCP calls
here, so it is safe to run with zero cloud credentials.

Stdlib only. Exits 0.
"""
import datetime
import json
import os
import sys


def now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def main() -> int:
    if len(sys.argv) < 4:
        print(json.dumps({"error": "on-converge.py: missing args"}))
        return 0
    run_dir, run_id = sys.argv[1], sys.argv[2]
    try:
        final_spec_fit = float(sys.argv[3])
    except ValueError:
        final_spec_fit = 0.0
    iterations = int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4].isdigit() else 0
    cost_cents = int(sys.argv[5]) if len(sys.argv) > 5 and sys.argv[5].isdigit() else 0
    company_slug = sys.argv[6] if len(sys.argv) > 6 else "unknown"
    hard_flow = sys.argv[7] if len(sys.argv) > 7 and sys.argv[7] not in ("", "null", "None") else None

    outcome = {
        "run_id": run_id,
        "company_slug": company_slug,
        "outcome": "converged",
        "final_spec_fit": final_spec_fit,
        "iterations": iterations,
        "cost_cents": cost_cents,
        "most_regenerated_flow": hard_flow,
        "terminated_at": now_iso(),
    }
    os.makedirs(run_dir, exist_ok=True)
    with open(os.path.join(run_dir, "run-outcome.json"), "w", encoding="utf-8") as fh:
        json.dump(outcome, fh, indent=2)

    patterns = os.path.join(run_dir, "memory", "patterns.md")
    os.makedirs(os.path.dirname(patterns), exist_ok=True)
    with open(patterns, "a", encoding="utf-8") as fh:
        fh.write(f"[{run_id}] [{now_iso()}] CONVERGED spec_fit={final_spec_fit:.3f} "
                 f"iters={iterations} cost={cost_cents}c hard_flow={hard_flow}\n")

    print(json.dumps({
        "recorded": "run-outcome.json",
        "followups": [
            "bigquery.insert(whyc_learning.run_outcomes, run-outcome.json)",
            "screenshots.capture(deploy_url)",
            "phoenix.experiments.annotate(run_id, 'converged')",
            "cloudtasks.notify(run_id)",
        ],
        "note": "followups are performed by the TS caller only when GCP env is present",
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
