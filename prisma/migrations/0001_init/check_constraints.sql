-- WhyC — Postgres-only structural constraints that Prisma cannot declare
-- natively. Apply AFTER 0001_init/migration.sql.
--
-- Every line below has a numbered anchor in CHANGELOG-v1.md and is referenced
-- from comments in prisma/schema.prisma. If you change anything here, the
-- corresponding integration test under apps/api/test/integration/ MUST be
-- updated in the same PR.
--
-- These statements are idempotent (IF NOT EXISTS) so the file can be re-run
-- safely during dev/test reset.

-- ─────────────────────────────────────────────────────────────────────────────
-- B11 — Company description citation enforcement
-- description_text non-null ⇒ description_source_url is a valid http(s) URL.
-- The OpenAPI CompanyDescription required-list and an integration test
-- (apps/api/test/integration/company-description.test.ts) provide belt-and-
-- suspenders coverage.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "companies"
  DROP CONSTRAINT IF EXISTS "companies_description_citation_chk";

ALTER TABLE "companies"
  ADD CONSTRAINT "companies_description_citation_chk"
  CHECK (
    "description_text" IS NULL
    OR (
      "description_source_url" IS NOT NULL
      AND "description_source_url" ~ '^https?://'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- B6 — One in-flight Run per Company
-- A company can have at most one Run in pending|running state at any time.
-- The kickoff job (SPEC.md §9) catches the unique-violation and returns the
-- existing Run row, treating it as a no-op idempotent kickoff.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "runs_one_inflight_per_company"
  ON "runs" ("company_id")
  WHERE "status" IN ('pending', 'running');

-- ─────────────────────────────────────────────────────────────────────────────
-- H-Y1 — One regen per (run, parent iteration, regen_flow)
-- Within a single Run, the same parent iteration cannot be regenerated twice
-- on the same flow. Prevents double-regen race when the agent retries.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "iterations_one_regen_per_parent_flow"
  ON "iterations" ("run_id", "parent_iter_id", "regen_flow")
  WHERE "parent_iter_id" IS NOT NULL AND "regen_flow" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- SC5 medium — PublicStatsSnapshot daily uniqueness
-- One snapshot per UTC day. The nightly rebuild cron uses
-- INSERT … ON CONFLICT (((generated_at AT TIME ZONE 'UTC')::date)) DO UPDATE.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "public_stats_snapshots_day_uniq"
  ON "public_stats_snapshots" ((("generated_at" AT TIME ZONE 'UTC')::date));

-- ─────────────────────────────────────────────────────────────────────────────
-- SC4 medium — slug normalization sanity check
-- Slug pattern is also enforced at the OpenAPI parameter layer; this CHECK
-- backstops bad writes from cron scrapers.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "companies"
  DROP CONSTRAINT IF EXISTS "companies_slug_pattern_chk";

ALTER TABLE "companies"
  ADD CONSTRAINT "companies_slug_pattern_chk"
  CHECK ("slug" ~ '^[a-z0-9][a-z0-9-]{0,63}$');

-- ─────────────────────────────────────────────────────────────────────────────
-- B1 / SPEC §4 — spec-fit numeric range
-- Both Run.final_spec_fit and Iteration.spec_fit are normalized to [0, 1].
-- A bad write here would propagate into UI percentage calcs.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "runs"
  DROP CONSTRAINT IF EXISTS "runs_final_spec_fit_range_chk";
ALTER TABLE "runs"
  ADD CONSTRAINT "runs_final_spec_fit_range_chk"
  CHECK ("final_spec_fit" IS NULL
         OR ("final_spec_fit" >= 0.0 AND "final_spec_fit" <= 1.0));

ALTER TABLE "iterations"
  DROP CONSTRAINT IF EXISTS "iterations_spec_fit_range_chk";
ALTER TABLE "iterations"
  ADD CONSTRAINT "iterations_spec_fit_range_chk"
  CHECK ("spec_fit" IS NULL
         OR ("spec_fit" >= 0.0 AND "spec_fit" <= 1.0));

ALTER TABLE "judge_verdicts"
  DROP CONSTRAINT IF EXISTS "judge_verdicts_score_range_chk";
ALTER TABLE "judge_verdicts"
  ADD CONSTRAINT "judge_verdicts_score_range_chk"
  CHECK ("score" >= 0.0 AND "score" <= 1.0);

-- ─────────────────────────────────────────────────────────────────────────────
-- SPEC §10.5 — Comment kind ↔ source_url dependency
-- public_quote MUST cite a public source; team_note has no requirement.
-- The service layer (BE team) also validates this; CHECK is the storage-level
-- belt for cron-driven writes.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "comments"
  DROP CONSTRAINT IF EXISTS "comments_public_quote_source_chk";

ALTER TABLE "comments"
  ADD CONSTRAINT "comments_public_quote_source_chk"
  CHECK (
    "kind" <> 'public_quote'
    OR ("source_url" IS NOT NULL AND "source_url" ~ '^https?://')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SPEC §6 / B10 — Run.deploy_revoked_confirmed_at requires deploy_revoked_at
-- Sweeper sets revoked_at first; only on Cloud Run delete success does
-- confirmed_at get written. Confirmed-without-revoked is impossible.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "runs"
  DROP CONSTRAINT IF EXISTS "runs_deploy_revoke_chain_chk";

ALTER TABLE "runs"
  ADD CONSTRAINT "runs_deploy_revoke_chain_chk"
  CHECK (
    "deploy_revoked_confirmed_at" IS NULL
    OR "deploy_revoked_at" IS NOT NULL
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- B5 / SPEC §10.5 — TakedownEvent version-monotonicity
-- companyVersionAfter MUST be greater than companyVersionBefore (CAS bumps
-- by 1 each transition); enforces forensic integrity (H-Y3).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "takedown_events"
  DROP CONSTRAINT IF EXISTS "takedown_events_version_monotonic_chk";

ALTER TABLE "takedown_events"
  ADD CONSTRAINT "takedown_events_version_monotonic_chk"
  CHECK ("company_version_after" > "company_version_before");
