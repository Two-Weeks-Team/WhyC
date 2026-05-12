// Per-run memory + hook-invocation helpers for the v4 "PDD on Runtime" pipeline.
//
// Two responsibilities:
//   1. runHook() — shell out to the scripts under hooks/ and return a typed
//      HookResult (exit code in the result, never thrown — the caller decides).
//   2. the three per-run memory files (session-handoff.md / decisions.md /
//      patterns.md) + manifest.jsonl — atomic writes / append helpers, and
//      seeding a fresh run dir from runs/.template/.
//
// Zero new npm deps: node stdlib only. The hooks themselves are bash + stdlib
// python3 (see hooks/README.md).

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, cpSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HookName, HookResult, ManifestLine } from '../pipeline/types.js';

/** Walk up from this module until we find the repo root (the dir containing
 *  `hooks/_lib.sh`). Works both in dev (`tsx src/...`) and built (`dist/...`).
 *  Override with WHYC_REPO_ROOT if the layout ever changes. */
function repoRoot(): string {
  const override = process.env['WHYC_REPO_ROOT'];
  if (override && existsSync(join(override, 'hooks', '_lib.sh'))) return override;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'hooks', '_lib.sh'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // last resort: cwd (Cloud Run job working dir)
  return process.cwd();
}

const ROOT = repoRoot();
export const HOOKS_DIR = join(ROOT, 'hooks');
export const RUNS_DIR = join(ROOT, 'runs');
const TEMPLATE_DIR = join(RUNS_DIR, '.template');

/** Map a HookName to its on-disk script path (.sh or .py). */
function hookPath(name: HookName): { interpreter: 'bash' | 'python3'; path: string } {
  const sh = join(HOOKS_DIR, `${name}.sh`);
  if (existsSync(sh)) return { interpreter: 'bash', path: sh };
  const py = join(HOOKS_DIR, `${name}.py`);
  if (existsSync(py)) return { interpreter: 'python3', path: py };
  throw new Error(`hook script not found for "${name}" under ${HOOKS_DIR}`);
}

/** Invoke a hook. Resolves with the exit code captured in HookResult; only
 *  rejects if the script could not be spawned at all (missing interpreter). */
export async function runHook(name: HookName, args: string[]): Promise<HookResult> {
  const { interpreter, path } = hookPath(name);
  const started = Date.now();
  return new Promise<HookResult>((resolvePromise, reject) => {
    const child = spawn(interpreter, [path, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      resolvePromise({
        hook: name,
        exit_code: code ?? -1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        duration_ms: Date.now() - started,
      });
    });
  });
}

/** True iff the hook exited 0. Convenience for "gate passed?" checks. */
export function hookPassed(r: HookResult): boolean {
  return r.exit_code === 0;
}

// ─── per-run files ───────────────────────────────────────────────────────────

export function runDir(runId: string): string {
  return join(RUNS_DIR, runId);
}
function memoryDir(runId: string): string {
  return join(runDir(runId), 'memory');
}

/** Seed a fresh run directory from runs/.template/, then stamp run-state.json. */
export function seedRunDir(runId: string, state: {
  iteration_id: string;
  company_slug: string;
  iter?: number;
  iter_limit?: number;
  total_cost_cents?: number;
  cost_limit_cents?: number;
  judge_prompt_version?: string;
}): string {
  const dir = runDir(runId);
  if (!existsSync(dir)) {
    cpSync(TEMPLATE_DIR, dir, { recursive: true });
  } else {
    mkdirSync(memoryDir(runId), { recursive: true });
  }
  const merged = {
    run_id: runId,
    iteration_id: state.iteration_id,
    company_slug: state.company_slug,
    iter: state.iter ?? 0,
    iter_limit: state.iter_limit ?? 7,
    total_cost_cents: state.total_cost_cents ?? 0,
    cost_limit_cents: state.cost_limit_cents ?? 500,
    advocate_mode: 'multi' as const,
    judge_prompt_version: state.judge_prompt_version ?? 'v1',
  };
  writeJsonAtomic(join(dir, 'run-state.json'), merged);
  return dir;
}

/** Patch run-state.json atomically (read-modify-write). */
export function patchRunState(runId: string, patch: Record<string, unknown>): void {
  const p = join(runDir(runId), 'run-state.json');
  const cur = existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>) : {};
  writeJsonAtomic(p, { ...cur, ...patch });
}

function writeJsonAtomic(path: string, obj: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  renameSync(tmp, path);
}

/** Append one ManifestLine to <run>/manifest.jsonl (the replayable record). */
export function appendManifestLine(runId: string, line: ManifestLine): void {
  appendFileSync(join(runDir(runId), 'manifest.jsonl'), JSON.stringify(line) + '\n');
}

/** Append a correlated line to memory/decisions.md. */
export function appendDecision(runId: string, text: string): void {
  mkdirSync(memoryDir(runId), { recursive: true });
  appendFileSync(join(memoryDir(runId), 'decisions.md'), `[${runId}] [${nowIso()}] ${text}\n`);
}

/** Append a line to memory/patterns.md (retry / failure / convergence log). */
export function appendPattern(runId: string, text: string): void {
  mkdirSync(memoryDir(runId), { recursive: true });
  appendFileSync(join(memoryDir(runId), 'patterns.md'), `[${runId}] [${nowIso()}] ${text}\n`);
}

/** Rewrite the session-handoff.md frontmatter and append a stage-log line. */
export function updateSessionHandoff(runId: string, patch: {
  status?: string;
  last_stage?: string;
  iter?: number;
  logLine?: string;
}): void {
  const p = join(memoryDir(runId), 'session-handoff.md');
  let text = existsSync(p) ? readFileSync(p, 'utf8') : '---\nrun_id: ' + runId + '\nstatus: scaffold\nlast_stage: ""\niter: 0\n---\n\n# Run session handoff\n\n## Stage log\n';
  const fmMatch = /^---\n([\s\S]*?)\n---\n/.exec(text);
  const fm: Record<string, string> = {};
  if (fmMatch) {
    for (const ln of fmMatch[1]!.split('\n')) {
      const m = /^([A-Za-z_]+):\s*(.*)$/.exec(ln);
      if (m) fm[m[1]!] = m[2]!;
    }
  }
  fm['run_id'] = runId;
  if (patch.status !== undefined) fm['status'] = patch.status;
  if (patch.last_stage !== undefined) fm['last_stage'] = JSON.stringify(patch.last_stage);
  if (patch.iter !== undefined) fm['iter'] = String(patch.iter);
  const newFm = '---\n' + Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n') + '\n---\n';
  text = fmMatch ? text.replace(fmMatch[0], newFm) : newFm + '\n' + text;
  if (patch.logLine) text = text.replace(/(## Stage log[\s\S]*?)$/, `$1\n[${nowIso()}] ${patch.logLine}`);
  mkdirSync(memoryDir(runId), { recursive: true });
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, p);
}

function nowIso(): string {
  return new Date().toISOString();
}

export const _internals = { repoRoot, hookPath, ROOT };
