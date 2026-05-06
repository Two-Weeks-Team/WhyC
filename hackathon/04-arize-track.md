# Arize Track — Detailed Requirements

**Source:** https://rapid-agent.devpost.com/details/arize-resources
**Captured:** 2026-05-06

> Arize is the **observability + tracing** track. Strongest fit for agents that benefit from telemetry, evaluation loops, and self-improvement.

---

## Track-Specific Judging Criteria

> "Submissions are evaluated on **technical implementation, meaningful use of tracing and MCP, quality of the agent's self-improvement loop, and overall impact**."

(This is in addition to the four common criteria — Technological Implementation / Design / Potential Impact / Quality of the Idea.)

---

## Required Implementation (HARD CONSTRAINTS)

The Arize track mandates a **code-owned agent runtime**. Acceptable runtimes:
- Gemini CLI
- Gemini Enterprise Agent Platform SDK
- **Google ADK** (Agent Development Kit)
- Agent Runtime (Vertex AI Reasoning Engine)
- Cloud Run

> ⚠️ Visual / no-code Agent Builder **alone is insufficient**. Developers must instrument code directly.

---

## Five Core Requirements

1. **Instrumentation** — Use **OpenInference** auto-instrumentors. Available for:
   - Google ADK
   - Agent Platform / Vertex AI / Gemini
   - Google GenAI SDK
   - LangChain
   - LlamaIndex

2. **Tracing Destination** — Send traces to:
   - **Phoenix Cloud** (free SaaS) — https://app.phoenix.arize.com
   - or self-hosted Phoenix

3. **MCP Integration** — Configure **Phoenix MCP server** so the agent can introspect its own runtime traces.

4. **Evaluation** — Run LLM-as-a-Judge evals or code evals on traces.

5. **Bonus** — Agents that demonstrate **self-improvement** using their own observability data (closed feedback loop).

---

## Documentation & Code

| Resource | Link |
| -------- | ---- |
| Phoenix docs | https://arize.com/docs/phoenix |
| Phoenix MCP Server guide | https://arize.com/docs/phoenix/integrations/phoenix-mcp-server |
| OpenInference (instrumentor library) | https://github.com/Arize-ai/openinference |
| End-to-end hackathon example | https://github.com/Arize-ai/gemini-hackathon |
| Vertex AI / Gemini tracing | https://docs.arize.com/arize/llm-tracing/tracing-integrations-auto/vertex-ai-gemini |
| LLM evals guide | https://arize.com/docs/phoenix/evaluation/llm-evals |
| Phoenix open-source repo | https://github.com/Arize-ai/phoenix |

### Instrumentor Python Packages
- `openinference-instrumentation-google-adk`
- `openinference-instrumentation-vertexai`
- `openinference-instrumentation-google-genai`

---

## Support

- Discord: https://discord.gg/7Dqk5ebCD4
- Arize contact: Richard Young — ryoung@arize.com

---

## Strategic Notes

- "Quality of the agent's **self-improvement loop**" is a track-specific scoring criterion → if WhyC picks Arize, design the loop explicitly.
- Free Phoenix Cloud tier means no extra spend beyond GCP.
- The end-to-end Gemini-hackathon example repo is the fastest scaffold.
