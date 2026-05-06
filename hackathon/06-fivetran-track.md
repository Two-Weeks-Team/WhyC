# Fivetran Track — Detailed Requirements

**Source:** https://rapid-agent.devpost.com/details/fivetran-resources
**Captured:** 2026-05-06

> Fivetran is the **data movement / ELT** track. Strongest fit for agents that operate on data extracted from many SaaS sources into a warehouse.

---

## Integration Options

Fivetran offers **two** integration approaches; either qualifies.

### Option A — MCP Server (preferred per rules wording)
> "Fivetran provides an example Open Source MCP Server you can download and set up to provide your agent with access to your Fivetran account"

- Repo: https://github.com/fivetran/fivetran-mcp
- Participants may **fork and extend** this repo.

### Option B — REST API
> Alternative integration using "the Fivetran REST APIs"

- Docs: https://fivetran.com/docs/rest-api
- Example framework: https://github.com/fivetran/api_framework

---

## Getting Started Checklist

| Step | Link |
| ---- | ---- |
| Create free 14-day trial | https://fivetran.com/signup |
| Obtain API auth credentials (single key works for REST + MCP) | https://fivetran.com/docs/rest-api/getting-started#authentication |
| Set up BigQuery destination | https://fivetran.com/docs/destinations/bigquery/setup-guide |

---

## About Fivetran

> "The data foundation for AI" — handles data movement, management, and transformation across business systems into secure foundations compatible with multiple clouds and tools.

---

## Strategic Notes

- **14-day trial** is shorter than the contest period (37 days). Plan setup so the trial covers the demo + judging window. Time the signup near June.
- The hackathon page does **not** publish Fivetran-specific judging criteria as of capture. The standard four criteria apply.
- Strong fit if the agent needs to operate on **multi-source SaaS data** (Salesforce, HubSpot, Stripe, Shopify, Zendesk, etc.).
- BigQuery is the canonical destination — also lets you reuse Vertex AI grounding.

---

## Action Items
- [ ] If choosing Fivetran, sign up for 14-day trial **AFTER 2026-05-29** so it spans submission + judging start
- [ ] Pick a clear data-source story (which connectors? what's the agent's "job"?)
- [ ] Decide MCP vs REST early — MCP is more on-theme
