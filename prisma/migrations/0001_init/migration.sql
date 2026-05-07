-- WhyC initial migration — generated from prisma/schema.prisma (locked v1).
-- Authored by hand (rather than via `prisma migrate dev`) so the locked schema
-- SHA-256 is preserved while the migration is reviewable line-by-line.
--
-- Apply order: this file FIRST, then 0001_init/check_constraints.sql.
--
-- Naming: tables are snake_case (matches @@map); columns are snake_case
-- (matches @map). Foreign keys use ON DELETE RESTRICT — takedown is the only
-- delete path and goes through Company.takedown_state, not row deletion.

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE "CompanyStatus" AS ENUM ('ingested', 'analyzing', 'no_go', 'building', 'deployed', 'converged', 'failed');
CREATE TYPE "NoGoReason" AS ENUM ('cost_over_ceiling', 'complexity_over_ceiling', 'ip_unsafe', 'not_demoable', 'regulated_domain');
CREATE TYPE "TakedownState" AS ENUM ('active', 'requested', 'removed');
CREATE TYPE "RunStatus" AS ENUM ('pending', 'running', 'converged', 'ceiling_hit', 'failed', 'aborted');
CREATE TYPE "RegenFlow" AS ENUM ('analyze', 'design', 'develop', 'deploy', 'full');
CREATE TYPE "JudgeVerdictLabel" AS ENUM ('pass', 'partial', 'fail');
CREATE TYPE "CommentKind" AS ENUM ('public_quote', 'team_note');
CREATE TYPE "SpecFitState" AS ENUM ('converged', 'near', 'below_floor', 'pending', 'n_a');

-- ─────────────────────────────────────────────────────────────────────────────
-- batches
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "batches" (
  "id"            TEXT         NOT NULL,
  "label"         TEXT         NOT NULL,
  "demo_day_at"   DATE         NOT NULL,
  "source_url"    TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "batches_label_key" ON "batches"("label");
CREATE INDEX "batches_demo_day_at_idx" ON "batches"("demo_day_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- companies
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "companies" (
  "id"                       TEXT             NOT NULL,
  "slug"                     TEXT             NOT NULL,
  "name"                     TEXT             NOT NULL,
  "name_pronunciation"       TEXT,
  "name_aria_label"          TEXT,
  "name_display_short"       TEXT,
  "batch_id"                 TEXT             NOT NULL,
  "description_text"         TEXT,
  "description_source_url"   TEXT,
  "description_language"     TEXT             DEFAULT 'en',
  "hires_posted_count"       BIGINT           NOT NULL DEFAULT 0,
  "last_hires_check_at"      TIMESTAMP(3),
  "status"                   "CompanyStatus"  NOT NULL DEFAULT 'ingested',
  "no_go_reason"             "NoGoReason",
  "takedown_state"           "TakedownState"  NOT NULL DEFAULT 'active',
  "takedown_requested_at"    TIMESTAMP(3),
  "takedown_removed_at"      TIMESTAMP(3),
  "takedown_reason"          TEXT,
  "version"                  BIGINT           NOT NULL DEFAULT 0,
  "current_run_id"           TEXT,
  "created_at"               TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"               TIMESTAMP(3)     NOT NULL,

  CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "companies_slug_key"           ON "companies"("slug");
CREATE UNIQUE INDEX "companies_current_run_id_key" ON "companies"("current_run_id");
CREATE INDEX "companies_batch_id_status_idx"                  ON "companies"("batch_id", "status");
CREATE INDEX "companies_status_idx"                           ON "companies"("status");
CREATE INDEX "companies_takedown_state_idx"                   ON "companies"("takedown_state");
CREATE INDEX "companies_batch_id_takedown_state_status_idx"   ON "companies"("batch_id", "takedown_state", "status");
CREATE INDEX "companies_hires_posted_count_id_idx"            ON "companies"("hires_posted_count", "id");
CREATE INDEX "companies_name_id_idx"                          ON "companies"("name", "id");

-- ─────────────────────────────────────────────────────────────────────────────
-- runs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "runs" (
  "id"                            TEXT            NOT NULL,
  "company_id"                    TEXT            NOT NULL,
  "kickoff_key"                   TEXT            NOT NULL,
  "started_at"                    TIMESTAMP(3)    NOT NULL,
  "completed_at"                  TIMESTAMP(3),
  "status"                        "RunStatus"     NOT NULL DEFAULT 'pending',
  "iter_limit"                    BIGINT          NOT NULL DEFAULT 7,
  "cost_limit_cents"              BIGINT          NOT NULL DEFAULT 500,
  "total_cost_cents"              BIGINT          NOT NULL DEFAULT 0,
  "final_spec_fit"                DOUBLE PRECISION,
  "final_spec_fit_state"          "SpecFitState",
  "currency_code"                 TEXT            NOT NULL DEFAULT 'USD',
  "deploy_url"                    TEXT,
  "deploy_expires_at"             TIMESTAMP(3),
  "deploy_revoked_at"             TIMESTAMP(3),
  "deploy_revoked_confirmed_at"   TIMESTAMP(3),
  "judge_prompt_version"          TEXT            NOT NULL DEFAULT 'v1',
  "created_at"                    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                    TIMESTAMP(3)    NOT NULL,

  CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "runs_kickoff_key_key" ON "runs"("kickoff_key");
CREATE INDEX "runs_company_id_started_at_idx"                       ON "runs"("company_id", "started_at");
CREATE INDEX "runs_status_idx"                                      ON "runs"("status");
CREATE INDEX "runs_started_at_idx"                                  ON "runs"("started_at");
CREATE INDEX "runs_deploy_expires_at_idx"                           ON "runs"("deploy_expires_at");
CREATE INDEX "runs_deploy_revoked_at_deploy_revoked_confirmed_at_idx"
  ON "runs"("deploy_revoked_at", "deploy_revoked_confirmed_at");
CREATE INDEX "runs_final_spec_fit_id_idx"   ON "runs"("final_spec_fit", "id");
CREATE INDEX "runs_total_cost_cents_id_idx" ON "runs"("total_cost_cents", "id");

-- ─────────────────────────────────────────────────────────────────────────────
-- iterations
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "iterations" (
  "id"                  TEXT             NOT NULL,
  "run_id"              TEXT             NOT NULL,
  "idx"                 BIGINT           NOT NULL,
  "parent_iter_id"      TEXT,
  "started_at"          TIMESTAMP(3)     NOT NULL,
  "ended_at"            TIMESTAMP(3),
  "spec_fit"            DOUBLE PRECISION,
  "spec_fit_state"      "SpecFitState",
  "regen_flow"          "RegenFlow",
  "cost_cents"          BIGINT           NOT NULL DEFAULT 0,
  "currency_code"       TEXT             NOT NULL DEFAULT 'USD',
  "judge_verdict_id"    TEXT,
  "phoenix_trace_id"    TEXT,
  "phoenix_trace_ids"   TEXT[]           NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at"          TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3)     NOT NULL,

  CONSTRAINT "iterations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "iterations_judge_verdict_id_key" ON "iterations"("judge_verdict_id");
CREATE UNIQUE INDEX "iterations_run_id_idx_key"       ON "iterations"("run_id", "idx");
CREATE INDEX "iterations_run_id_idx"                  ON "iterations"("run_id");
CREATE INDEX "iterations_parent_iter_id_idx"          ON "iterations"("parent_iter_id");
CREATE INDEX "iterations_phoenix_trace_id_idx"        ON "iterations"("phoenix_trace_id");

-- ─────────────────────────────────────────────────────────────────────────────
-- judge_verdicts
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "judge_verdicts" (
  "id"                    TEXT                  NOT NULL,
  "iteration_id"          TEXT                  NOT NULL,
  "judge_prompt_version"  TEXT                  NOT NULL,
  "score"                 DOUBLE PRECISION      NOT NULL,
  "spec_fit_state"        "SpecFitState",
  "label"                 "JudgeVerdictLabel"   NOT NULL,
  "verdict_json"          JSONB                 NOT NULL,
  "trace_id"              TEXT,
  "created_at"            TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3)          NOT NULL,

  CONSTRAINT "judge_verdicts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "judge_verdicts_iteration_id_key" ON "judge_verdicts"("iteration_id");
CREATE INDEX "judge_verdicts_judge_prompt_version_idx" ON "judge_verdicts"("judge_prompt_version");

-- ─────────────────────────────────────────────────────────────────────────────
-- judge_prompts
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "judge_prompts" (
  "id"             TEXT          NOT NULL,
  "version"        TEXT          NOT NULL,
  "body_markdown"  TEXT          NOT NULL,
  "body_language"  TEXT          NOT NULL DEFAULT 'en',
  "sha256"         TEXT          NOT NULL,
  "frozen_at"      TIMESTAMP(3)  NOT NULL,
  "created_at"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "judge_prompts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "judge_prompts_version_key" ON "judge_prompts"("version");

-- ─────────────────────────────────────────────────────────────────────────────
-- comments
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "comments" (
  "id"             TEXT             NOT NULL,
  "company_id"     TEXT             NOT NULL,
  "kind"           "CommentKind"    NOT NULL,
  "body"           VARCHAR(1000)    NOT NULL,
  "body_language"  TEXT             NOT NULL DEFAULT 'en',
  "author_handle"  TEXT,
  "source_url"     TEXT,
  "posted_at"      TIMESTAMP(3)     NOT NULL,
  "created_at"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3)     NOT NULL,

  CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "comments_company_id_posted_at_idx" ON "comments"("company_id", "posted_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- takedown_events
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "takedown_events" (
  "id"                       TEXT             NOT NULL,
  "company_id"               TEXT             NOT NULL,
  "from_state"               "TakedownState"  NOT NULL,
  "to_state"                 "TakedownState"  NOT NULL,
  "reason"                   TEXT,
  "reporter_contact"         TEXT,
  "actor"                    TEXT             NOT NULL,
  "occurred_at"              TIMESTAMP(3)     NOT NULL,
  "company_version_before"   BIGINT           NOT NULL,
  "company_version_after"    BIGINT           NOT NULL,
  "created_at"               TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "takedown_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "takedown_events_company_id_occurred_at_idx" ON "takedown_events"("company_id", "occurred_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- public_stats_snapshots
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "public_stats_snapshots" (
  "id"                          TEXT          NOT NULL,
  "total_companies_ingested"    BIGINT        NOT NULL,
  "total_runs_completed"        BIGINT        NOT NULL,
  "total_shipped"               BIGINT        NOT NULL,
  "total_no_go"                 BIGINT        NOT NULL,
  "median_ship_time_seconds"    BIGINT        NOT NULL,
  "median_run_cost_cents"       BIGINT        NOT NULL,
  "currency_code"               TEXT          NOT NULL DEFAULT 'USD',
  "generated_at"                TIMESTAMP(3)  NOT NULL,
  "created_at"                  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "public_stats_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "public_stats_snapshots_generated_at_idx" ON "public_stats_snapshots"("generated_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- Foreign keys
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "companies"
  ADD CONSTRAINT "companies_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "batches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "companies"
  ADD CONSTRAINT "companies_current_run_id_fkey"
  FOREIGN KEY ("current_run_id") REFERENCES "runs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;
-- Deferrable so the kickoff transaction can INSERT Run + UPDATE
-- Company.current_run_id within a single tx without ordering trickery (B6).

ALTER TABLE "runs"
  ADD CONSTRAINT "runs_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "iterations"
  ADD CONSTRAINT "iterations_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "runs"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "iterations"
  ADD CONSTRAINT "iterations_parent_iter_id_fkey"
  FOREIGN KEY ("parent_iter_id") REFERENCES "iterations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
-- M12 lineage: parent removal is a no-op (we never delete iterations); SET NULL
-- defends against hypothetical future hard-delete without breaking lineage reads.

ALTER TABLE "iterations"
  ADD CONSTRAINT "iterations_judge_verdict_id_fkey"
  FOREIGN KEY ("judge_verdict_id") REFERENCES "judge_verdicts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "comments"
  ADD CONSTRAINT "comments_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "takedown_events"
  ADD CONSTRAINT "takedown_events_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
