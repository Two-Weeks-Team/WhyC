// Cron: pipeline_kickoff — manual / triggered.
// Selects up to 12 ingested companies and spawns Runs against them.
// Coordinates: SELECT FOR UPDATE on Run rows; idempotent on kickoffKey.
// STUB. TODO(WK2): wire this to pipeline/{analyze,go-no-go,develop,deploy,
// self-improve}.ts once those stages are implemented.
//
// Reference implementation pattern: see pipeline/analyze.ts.
export async function run(): Promise<void> {
  console.warn('[pipeline-kickoff] STUB — pipeline stages 2-5 pending (WK1-2 deliverable)');
}
