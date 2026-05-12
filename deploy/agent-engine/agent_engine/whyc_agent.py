"""WhyC pipeline agent — the Vertex AI Agent Engine front for the WhyC pipeline.

`run_company(...)` triggers one execution of the `pipeline-kickoff-v2` Cloud Run
job (image `whyc-jobs`, entrypoint `apps/jobs/dist/main.js`, WHYC_JOB dispatch),
overriding the per-run env vars the job reads (WHYC_COMPANY_SLUG / WHYC_SOURCE_URL
/ WHYC_BODY / WHYC_ITER_LIMIT / WHYC_COST_LIMIT_CENTS). It returns the Cloud Run
execution name so the caller can poll it.

The pipeline (analyze → go/no-go → loop(develop → deploy → judge → introspect →
self-improve)) runs entirely inside that job; every model call goes through
Vertex AI Gemini 2.5, every stage is mechanically gated by the hooks/ layer, and
the run is traced to Arize Phoenix (which the introspect stage reads back).
"""

from __future__ import annotations

import re
from typing import Any

# Defaults mirror the job manifest (deploy/cloud-run/jobs/pipeline-kickoff-v2.yaml).
PROJECT_ID = "whyc-prod"
LOCATION = "us-central1"
JOB_ID = "pipeline-kickoff-v2"

_SLUG_RE = re.compile(r"^[a-z]([-a-z0-9]*[a-z0-9])?$")


class WhycPipelineAgent:
    """Agent Engine entry object. Picklable; set_up() builds the Cloud Run client."""

    def __init__(
        self,
        project_id: str = PROJECT_ID,
        location: str = LOCATION,
        job_id: str = JOB_ID,
    ) -> None:
        self._project_id = project_id
        self._location = location
        self._job_id = job_id
        self._client = None  # populated by set_up()

    # Vertex AI Agent Engine calls set_up() once after deploy / on cold start.
    def set_up(self) -> None:
        from google.cloud import run_v2

        self._client = run_v2.JobsClient()

    @property
    def _job_name(self) -> str:
        return f"projects/{self._project_id}/locations/{self._location}/jobs/{self._job_id}"

    def run_company(
        self,
        company_slug: str,
        source_url: str,
        body: str,
        iter_limit: int = 7,
        cost_limit_cents: int = 500,
        company_name: str | None = None,
    ) -> dict[str, Any]:
        """Run the full WhyC pipeline for one company.

        Args:
            company_slug: lowercase RFC1035 label (a-z0-9-, starts with a letter).
            source_url: the company's public posting / homepage URL.
            body: the public posting text (sanitized inside the job before any LLM call).
            iter_limit: max develop→judge→improve iterations (default 7).
            cost_limit_cents: cost ceiling per run, in cents (default 500 = $5).
            company_name: optional human-readable name.

        Returns:
            {"execution": "<cloud run execution resource name>", "job": "<job name>"}.
        """
        if not _SLUG_RE.match(company_slug or ""):
            raise ValueError(
                f"company_slug must be a lowercase RFC1035 label, got {company_slug!r}"
            )
        if not source_url:
            raise ValueError("source_url is required")
        if not body:
            raise ValueError("body is required")
        if self._client is None:
            self.set_up()

        from google.cloud import run_v2

        env = [
            run_v2.EnvVar(name="WHYC_JOB", value="pipeline-kickoff-v2"),
            run_v2.EnvVar(name="WHYC_COMPANY_SLUG", value=company_slug),
            run_v2.EnvVar(name="WHYC_SOURCE_URL", value=source_url),
            run_v2.EnvVar(name="WHYC_BODY", value=body),
            run_v2.EnvVar(name="WHYC_ITER_LIMIT", value=str(int(iter_limit))),
            run_v2.EnvVar(name="WHYC_COST_LIMIT_CENTS", value=str(int(cost_limit_cents))),
        ]
        if company_name:
            env.append(run_v2.EnvVar(name="WHYC_COMPANY_NAME", value=company_name))

        overrides = run_v2.RunJobRequest.Overrides(
            container_overrides=[
                run_v2.RunJobRequest.Overrides.ContainerOverride(env=env)
            ]
        )
        op = self._client.run_job(
            request=run_v2.RunJobRequest(name=self._job_name, overrides=overrides)
        )
        # op.metadata is google.cloud.run_v2.types.Execution while running.
        execution_name = getattr(op.metadata, "name", "") if op.metadata else ""
        return {"execution": execution_name, "job": self._job_name}

    # `query` is the conventional Reasoning Engine method name; expose a thin
    # alias so the agent is callable via the standard query() surface too.
    def query(self, **kwargs: Any) -> dict[str, Any]:
        return self.run_company(**kwargs)
