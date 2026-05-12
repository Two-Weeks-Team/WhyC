#!/usr/bin/env python3
"""Register (or update) the WhyC pipeline as a Vertex AI Agent Engine entity.

This is the operator-run step that closes hackathon R5 ("Agent Builder used"):
it uploads `agent_engine/` to the staging bucket, builds a managed container,
and creates a Reasoning Engine visible in the Vertex AI console under
"Agent Engine". The resource name it prints (`projects/.../reasoningEngines/...`)
goes in the Devpost submission.

Prereqs:
  - `pip install -r deploy/agent-engine/agent_engine/requirements.txt`
    (pulls google-cloud-aiplatform[reasoningengine] + google-cloud-run)
  - ADC available (`gcloud auth application-default login`, or run on a GCP SA)
  - The Cloud Run job `pipeline-kickoff-v2` exists in us-central1
    (deploy/.github/workflows/deploy.yml → deploy-jobs).

Usage:
  python deploy/agent-engine/register.py            # create
  python deploy/agent-engine/register.py --update RESOURCE_NAME

Idempotency: Agent Engine has no natural unique key on display_name, so a second
plain `create` makes a second engine. Pass --update with the existing resource
name (or --list to find it) to mutate in place.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

PROJECT_ID = "whyc-prod"
LOCATION = "us-central1"
STAGING_BUCKET = "gs://whyc-prod-artifacts"
DISPLAY_NAME = "WhyC pipeline"

_HERE = os.path.dirname(os.path.abspath(__file__))
_SPEC_PATH = os.path.join(_HERE, "reasoning-engine.spec.json")
_REQS_PATH = os.path.join(_HERE, "agent_engine", "requirements.txt")


def _description() -> str:
    with open(_SPEC_PATH, "r", encoding="utf-8") as fh:
        spec = json.load(fh)
    return spec.get("description", DISPLAY_NAME)


def _requirements() -> list[str]:
    out: list[str] = []
    with open(_REQS_PATH, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line and not line.startswith("#"):
                out.append(line)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Register the WhyC Agent Engine entity")
    parser.add_argument("--update", metavar="RESOURCE_NAME", help="update an existing engine in place")
    parser.add_argument("--list", action="store_true", help="list existing engines and exit")
    args = parser.parse_args()

    import vertexai
    from vertexai.preview import reasoning_engines

    vertexai.init(project=PROJECT_ID, location=LOCATION, staging_bucket=STAGING_BUCKET)

    if args.list:
        for eng in reasoning_engines.ReasoningEngine.list():
            print(f"{eng.resource_name}\t{getattr(eng, 'display_name', '')}")
        return 0

    # Import here so the package is resolvable from the repo root or this dir.
    sys.path.insert(0, _HERE)
    from agent_engine import WhycPipelineAgent  # noqa: E402

    common_kwargs = dict(
        requirements=_requirements(),
        extra_packages=[os.path.join(_HERE, "agent_engine")],
        display_name=DISPLAY_NAME,
        description=_description(),
    )

    if args.update:
        engine = reasoning_engines.ReasoningEngine(args.update)
        engine = engine.update(reasoning_engine=WhycPipelineAgent(), **common_kwargs)
        print(f"updated: {engine.resource_name}")
        return 0

    engine = reasoning_engines.ReasoningEngine.create(WhycPipelineAgent(), **common_kwargs)
    print(f"created: {engine.resource_name}")
    print("Record this resource name in the Devpost submission (R5).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
