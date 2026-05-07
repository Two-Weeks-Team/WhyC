/**
 * Closed-vocabulary error codes (B3 + SPEC.md §8.1).
 * Append-only: never reuse. New codes get appended; never edit existing rows.
 */

export const ERROR_CODES = {
  REQUEST_INVALID_SORT: 'request.invalid_sort',
  REQUEST_INVALID_CURSOR: 'request.invalid_cursor',
  REQUEST_INVALID_PARAM: 'request.invalid_param',
  REQUEST_NOT_ACCEPTABLE: 'request.not_acceptable',
  REQUEST_UNPROCESSABLE: 'request.unprocessable',
  COMPANY_NOT_FOUND: 'company.not_found',
  COMPANY_TAKEDOWN_REMOVED: 'company.takedown_removed',
  BATCH_NOT_FOUND: 'batch.not_found',
  RUN_NOT_FOUND: 'run.not_found',
  ITERATION_NOT_FOUND: 'iteration.not_found',
  JUDGE_PROMPT_NOT_FOUND: 'judge.prompt_not_found',
  COMMENTS_USE_COMPANY_PATH: 'comments.use_company_path',
  DEPLOY_EXPIRED: 'deploy.expired',
  SERVICE_RATE_LIMITED: 'service.rate_limited',
  SERVICE_INTERNAL_ERROR: 'service.internal_error',
  SERVICE_DB_UNAVAILABLE: 'service.db_unavailable',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const PROBLEM_BASE_URL = 'https://whyc.example/problems';

export function problemTypeUri(slug: string | null): string {
  return slug == null ? 'about:blank' : `${PROBLEM_BASE_URL}/${slug}`;
}
