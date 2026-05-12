# Vertex AI Agent Engine registration (hackathon R5)

R5 ("Agent Builder used") = the project is registered as a **Vertex AI Agent
Engine / Reasoning Engine** entity. This directory holds:

- [`reasoning-engine.spec.json`](./reasoning-engine.spec.json) — the registration manifest (display name / description / class-method contract).
- [`agent_engine/`](./agent_engine/) — the Python agent package that gets uploaded and built into the managed container.
- [`register.py`](./register.py) — the operator-run create/update script.

## State

- The Vertex AI API (`aiplatform.googleapis.com`) is enabled on `whyc-prod`.
- A *thin* registration (just `displayName` + `description`) is **not** usable —
  a Reasoning Engine needs a deployed Python agent package (`spec.packageSpec`:
  pickled agent object + `requirements.txt` + dependency files in GCS). That
  package is now committed: [`agent_engine/whyc_agent.py`](./agent_engine/whyc_agent.py)
  exposes `WhycPipelineAgent.run_company(company_slug, source_url, body, iter_limit=7, cost_limit_cents=500)`
  (and `query(**kwargs)` as the conventional alias), which triggers one execution
  of the `pipeline-kickoff-v2` Cloud Run job with the per-run `WHYC_*` env
  overrides. It does **not** re-implement the pipeline.
- The Cloud Run job it fronts (`pipeline-kickoff-v2`, image `whyc-jobs`) is
  created/updated by `.github/workflows/deploy.yml` → `deploy-jobs` from
  [`../cloud-run/jobs/pipeline-kickoff-v2.yaml`](../cloud-run/jobs/pipeline-kickoff-v2.yaml).
- R5 is additionally backed by the rest of the project: every model call goes
  through **Vertex AI Gemini 2.5** (Flash + Pro) via `apps/jobs/src/util/gemini.ts`;
  the pipeline runs as a **Cloud Run** job; it is traced to **Arize Phoenix**
  (R6) and reads its own traces back (`introspect-v2` via `@arizeai/phoenix-client.getSpans`),
  and the judge panel writes its verdicts back as Phoenix span annotations.

## How to register (one operator command)

`reasoning_engines.ReasoningEngine.create(...)` uploads `agent_engine/` to
`gs://whyc-prod-artifacts`, builds a managed container, and creates the engine —
this needs **Application Default Credentials for an identity that can write to
that bucket and create Vertex AI resources** (e.g. the project owner
`app.2weeks@gmail.com`). The gcloud *CLI* being logged in as that account is not
enough — ADC is separate.

```bash
# 1. point ADC at the whyc-prod-authorized account (interactive, one-time)
gcloud auth application-default login        # pick app.2weeks@gmail.com

# 2. install the SDK and register
python3 -m venv /tmp/whyc-ae && /tmp/whyc-ae/bin/pip install -r deploy/agent-engine/agent_engine/requirements.txt
/tmp/whyc-ae/bin/python deploy/agent-engine/register.py
#   → prints:  created: projects/<num>/locations/us-central1/reasoningEngines/<id>

# (re-run after changing the agent package:)
/tmp/whyc-ae/bin/python deploy/agent-engine/register.py --list                 # find the resource name
/tmp/whyc-ae/bin/python deploy/agent-engine/register.py --update <resource>    # update in place
```

The engine is then visible in the Vertex AI console under "Agent Engine".
**Record the resource name in the Devpost submission.**

> Attempted in the v4-plumbing session with the dev box's existing ADC
> (`centisgood@gmail.com`) — that identity is not a `whyc-prod` member, so the
> staging-bucket read 403'd. The package + script are in place; only `gcloud auth
> application-default login` (step 1, by the operator) is outstanding.
