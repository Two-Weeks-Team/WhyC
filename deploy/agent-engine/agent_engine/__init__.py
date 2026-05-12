"""WhyC Vertex AI Agent Engine (Reasoning Engine) package.

This package is uploaded to the Vertex AI staging bucket and built into a
managed container by `vertexai.preview.reasoning_engines.ReasoningEngine.create`.
The agent itself does NOT re-implement the pipeline — it kicks off the existing
`pipeline-kickoff-v2` Cloud Run *job* with per-execution env overrides.
"""

from .whyc_agent import WhycPipelineAgent

__all__ = ["WhycPipelineAgent"]
