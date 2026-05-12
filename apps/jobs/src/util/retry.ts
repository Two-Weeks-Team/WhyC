// Retry-with-budget framework for pipeline stage bodies (master-plan-v4 Phase 1).
//
// Wraps a stage call so that *retriable* StageErrors are re-attempted up to a
// budget. Each failure is routed through the `on-fail.py` hook, which owns the
// decision (retry / ceiling_hit / abort) and writes a correlated line to the
// run's patterns.md — so the retry policy is mechanical and auditable, not
// buried in this function.
//
// Non-retriable errors (and anything that isn't a StageError) are re-thrown
// immediately. A `ceiling_hit` decision throws a CeilingHitError the dispatcher
// catches to terminate the run cleanly (kind: 'ceiling_hit' in LoopDecision).

import { StageError } from '../pipeline/types.js';
import { runHook, runDir } from './memory.js';

export class CeilingHitError extends Error {
  constructor(public readonly reason: string, public readonly stage: string) {
    super(`ceiling hit (${stage}): ${reason}`);
    this.name = 'CeilingHitError';
  }
}

export interface RetryOpts {
  /** Correlation id — used to locate runs/<run_id>/run-state.json for the hook. */
  runId: string;
  /** Stage label (passed to the hook + used in error messages). */
  stage: StageError['stage'];
  /** Max retry attempts after the first try (so total attempts = maxRetries + 1). */
  maxRetries?: number;
  /** Override which errors count as retriable. Default: StageError.retriable === true. */
  isRetriable?: (err: unknown) => boolean;
}

interface OnFailDecision {
  action: 'retry' | 'ceiling_hit' | 'abort';
  attempt?: number;
  reason?: string;
}

function defaultRetriable(err: unknown): boolean {
  return err instanceof StageError && err.retriable === true;
}

function errCode(err: unknown): string {
  return err instanceof StageError ? err.code : 'unknown_error';
}

/** Run `fn`; on a retriable failure consult `on-fail.py` and act on its
 *  decision. Resolves with fn's value on success. Throws:
 *   - the original error if non-retriable or not a StageError
 *   - CeilingHitError if the hook says the retry budget is exhausted
 *   - the last error if `abort`
 */
export async function retryWithBudget<T>(fn: () => Promise<T>, opts: RetryOpts): Promise<T> {
  const maxRetries = opts.maxRetries ?? 2;
  const isRetriable = opts.isRetriable ?? defaultRetriable;
  const dir = runDir(opts.runId);
  let attempt = 0;
  let lastErr: unknown;

  for (;;) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetriable(err)) throw err;

      const code = errCode(err);
      const retriable = err instanceof StageError ? err.retriable : true;
      const hook = await runHook('on-fail', [dir, opts.stage, code, String(attempt), String(maxRetries), String(retriable)]);
      const decision = parseDecision(hook.stdout);

      if (decision.action === 'retry') {
        attempt = decision.attempt ?? attempt + 1;
        continue;
      }
      if (decision.action === 'ceiling_hit') {
        throw new CeilingHitError(decision.reason ?? `retry budget exhausted on ${opts.stage}:${code}`, opts.stage);
      }
      // abort
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    }
  }
}

function parseDecision(stdout: string): OnFailDecision {
  // The hook prints exactly one JSON object on its last non-empty line.
  const line = stdout.split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? '';
  try {
    const obj = JSON.parse(line) as OnFailDecision;
    if (obj && (obj.action === 'retry' || obj.action === 'ceiling_hit' || obj.action === 'abort')) return obj;
  } catch {
    // fall through
  }
  // Hook didn't speak our protocol — fail closed (abort) rather than loop forever.
  return { action: 'abort', reason: `on-fail hook returned unparseable output: ${line.slice(0, 120)}` };
}
