// Learning signal for self-improve's regen decision (master-plan-v4 Phase 1).
//
// On terminate, a run records a RunOutcomeRow. On a *new* run for the same
// company, self-improve reads back the aggregate of prior outcomes to bias the
// regen-flow choice toward historically-hard flows.
//
// Storage: the canonical store will be BigQuery (`whyc_learning.run_outcomes`,
// wired in Phase 6 once GCP is provisioned). Until then — and as the always-
// available fallback — the store is the filesystem: every run writes
// runs/<id>/run-outcome.json (via the on-converge.py hook), and this module
// reads those back. Empty result set = valid cold start (LESSONS: "BigQuery
// learning N<10 cold-start" is expected; fall through to judge+trace signals).
//
// No new npm deps: the BigQuery client is loaded lazily and only when
// WHYC_BIGQUERY_DATASET is set AND the package is actually installed; otherwise
// the filesystem path is used.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { RunOutcomeRow, LearningSignal } from '../pipeline/types.js';
import { runHook, runDir, RUNS_DIR } from './memory.js';

/** Record a converged run's outcome. Always writes the local record (via the
 *  on-converge.py hook); additionally inserts into BigQuery when configured. */
export async function recordRunOutcome(runId: string, outcome: RunOutcomeRow): Promise<void> {
  const dir = runDir(runId);
  await runHook('on-converge', [
    dir,
    outcome.run_id,
    String(outcome.final_spec_fit),
    String(outcome.iterations),
    String(outcome.cost_cents),
    outcome.company_slug,
    outcome.most_regenerated_flow ?? 'null',
  ]);
  await maybeInsertBigQuery(outcome);
}

/** Aggregate prior outcomes for a company into a LearningSignal. */
export async function loadLearningSignal(companySlug: string): Promise<LearningSignal> {
  const fromCloud = await maybeQueryBigQuery(companySlug);
  const rows = fromCloud ?? readLocalOutcomes(companySlug);
  if (rows.length === 0) {
    return { prior_run_count: 0, historically_hard_flows: [], best_prior_spec_fit: null };
  }
  const flowCounts = new Map<string, number>();
  let best: number | null = null;
  for (const r of rows) {
    if (r.most_regenerated_flow) flowCounts.set(r.most_regenerated_flow, (flowCounts.get(r.most_regenerated_flow) ?? 0) + 1);
    if (best === null || r.final_spec_fit > best) best = r.final_spec_fit;
  }
  const hard = [...flowCounts.entries()].sort((a, b) => b[1] - a[1]).map(([flow]) => flow);
  return { prior_run_count: rows.length, historically_hard_flows: hard, best_prior_spec_fit: best };
}

// ─── filesystem store (always available) ─────────────────────────────────────

function readLocalOutcomes(companySlug: string): RunOutcomeRow[] {
  if (!existsSync(RUNS_DIR)) return [];
  const out: RunOutcomeRow[] = [];
  for (const entry of readdirSync(RUNS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const p = join(RUNS_DIR, entry.name, 'run-outcome.json');
    if (!existsSync(p)) continue;
    try {
      const row = JSON.parse(readFileSync(p, 'utf8')) as RunOutcomeRow;
      if (row && row.company_slug === companySlug) out.push(row);
    } catch {
      // skip malformed
    }
  }
  return out;
}

// ─── BigQuery store (Phase 6+; no-op until GCP is provisioned) ───────────────

function bqDataset(): string | null {
  return process.env['WHYC_BIGQUERY_DATASET'] || null;
}

/** Lazily import @google-cloud/bigquery; returns null if not installed/configured. */
async function bigqueryClient(): Promise<unknown | null> {
  if (!bqDataset()) return null;
  try {
    // dynamic — the package is not a hard dependency yet (added in Phase 6)
    const mod = (await import('@google-cloud/bigquery' as string)) as { BigQuery: new () => unknown };
    return new mod.BigQuery();
  } catch {
    return null;
  }
}

async function maybeInsertBigQuery(outcome: RunOutcomeRow): Promise<void> {
  const client = await bigqueryClient();
  if (!client) return; // filesystem record (already written by the hook) is the source of truth
  try {
    // @ts-expect-error — client shape is known at Phase 6 when the dep is added
    await client.dataset(bqDataset()).table('run_outcomes').insert([outcome]);
  } catch (err) {
    // Non-fatal: a failed BQ insert must never fail the run. The local record stands.
    console.warn(`[bigquery-learning] insert failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function maybeQueryBigQuery(companySlug: string): Promise<RunOutcomeRow[] | null> {
  const client = await bigqueryClient();
  if (!client) return null;
  try {
    // @ts-expect-error — client shape is known at Phase 6 when the dep is added
    const [rows] = await client.query({
      query: `SELECT * FROM \`${bqDataset()}.run_outcomes\` WHERE company_slug = @slug ORDER BY terminated_at DESC LIMIT 50`,
      params: { slug: companySlug },
    });
    return rows as RunOutcomeRow[];
  } catch {
    return null; // fall back to filesystem
  }
}
