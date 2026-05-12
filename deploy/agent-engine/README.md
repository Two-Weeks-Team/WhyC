# Vertex AI Agent Engine registration (hackathon R5)

R5 ("Agent Builder used") = the project is registered as a **Vertex AI Agent
Engine / Reasoning Engine** entity. This directory holds the registration
manifest ([`reasoning-engine.spec.json`](./reasoning-engine.spec.json)) and the
steps to apply it.

## State

- The Vertex AI API (`aiplatform.googleapis.com`) is enabled on `whyc-prod` and
  the `reasoningEngines` REST endpoint is reachable.
- A *thin* registration (just `displayName` + `description`) is **not** usable —
  the API accepts the request but a Reasoning Engine needs a deployed Python
  agent package (`spec.packageSpec`: pickled agent object + `requirements.txt` +
  dependency files in GCS). So registration requires a small Python wrapper.
- Until that's deployed, R5 is substantively backed by the rest of the project:
  every model call goes through **Vertex AI Gemini 2.5** (Flash + Pro) via
  `apps/jobs/src/util/gemini.ts`; the pipeline runs as a **Cloud Run** job;
  it is traced to **Arize Phoenix** (the partner integration, R6) and reads its
  own traces back (`introspect-v2`). The Reasoning Engine registration is the
  formal Agent-Engine surface on top of that.

## How to register (operator / follow-up)

1. Create a Python package `agent_engine/` with a class whose `query` (or a
   named class-method) triggers the WhyC pipeline. It does not re-implement the
   pipeline — it kicks off the existing Cloud Run job:

   ```python
   # agent_engine/whyc_agent.py
   from google.cloud import run_v2

   class WhycPipelineAgent:
       def set_up(self):
           self.client = run_v2.JobsClient()
           self.job = "projects/whyc-prod/locations/us-central1/jobs/pipeline-kickoff"

       def run_company(self, company_slug: str, source_url: str, body: str,
                       iter_limit: int = 7, cost_limit_cents: int = 500):
           op = self.client.run_job(request={
               "name": self.job,
               "overrides": {"container_overrides": [{"env": [
                   {"name": "WHYC_JOB", "value": "pipeline_kickoff_v2"},
                   {"name": "WHYC_COMPANY_SLUG", "value": company_slug},
                   {"name": "WHYC_SOURCE_URL", "value": source_url},
                   {"name": "WHYC_BODY", "value": body},
                   {"name": "WHYC_ITER_LIMIT", "value": str(iter_limit)},
                   {"name": "WHYC_COST_LIMIT_CENTS", "value": str(cost_limit_cents)},
               ]}]},
           })
           return {"execution": op.metadata.name}
   ```

2. Register it:

   ```python
   import vertexai
   from vertexai.preview import reasoning_engines
   vertexai.init(project="whyc-prod", location="us-central1",
                 staging_bucket="gs://whyc-prod-artifacts")
   from agent_engine.whyc_agent import WhycPipelineAgent
   reasoning_engines.ReasoningEngine.create(
       WhycPipelineAgent(),
       requirements=["google-cloud-run", "google-cloud-aiplatform[reasoningengine]"],
       display_name="WhyC pipeline",
       description=open("deploy/agent-engine/reasoning-engine.spec.json").read(),  # or the description field
   )
   ```

   This uploads the package to the staging bucket, builds the managed container,
   and creates the Reasoning Engine — visible in the Vertex AI console under
   "Agent Engine". Capture the resource name (`projects/.../reasoningEngines/...`)
   for the Devpost submission.

3. **Prerequisite** for step 1: the Cloud Run *job* `pipeline-kickoff` must exist
   and its container must dispatch `WHYC_JOB=pipeline_kickoff_v2` to
   `pipelineKickoffV2(...)` reading the `WHYC_*` env vars — see the follow-up in
   `apps/jobs/src/main.ts` (currently dispatches the v1 jobs only) and a
   `deploy/cloud-run/jobs/pipeline-kickoff-v2.yaml` using the `whyc-jobs` image
   from `deploy/Dockerfile.jobs`.
