import { ERROR_CODES, type ErrorCode } from '@/util/error-codes';

/**
 * Domain error carrying the (status, code, title, detail) tuple required for
 * RFC 7807 Problem responses. The exception filter (problem.filter.ts) is the
 * single place we map errors to HTTP responses.
 */
export class DomainError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly title: string;
  readonly detail?: string;
  readonly retryAfterSeconds?: number;
  readonly typeSlug: string | null;

  constructor(input: {
    status: number;
    code: ErrorCode;
    title: string;
    detail?: string;
    retryAfterSeconds?: number;
    typeSlug?: string | null;
  }) {
    super(`${input.code}: ${input.title}${input.detail ? ` — ${input.detail}` : ''}`);
    this.name = 'DomainError';
    this.status = input.status;
    this.code = input.code;
    this.title = input.title;
    this.detail = input.detail;
    this.retryAfterSeconds = input.retryAfterSeconds;
    this.typeSlug = input.typeSlug ?? null;
  }
}

// ── Convenience constructors per row of SPEC.md §8.1 ──────────────────────

export const errors = {
  invalidSort: (detail: string) =>
    new DomainError({
      status: 400,
      code: ERROR_CODES.REQUEST_INVALID_SORT,
      title: 'Invalid sort field',
      detail,
      typeSlug: 'request-invalid-sort',
    }),

  invalidCursor: (detail = 'Cursor failed base64url + JSON decode.') =>
    new DomainError({
      status: 400,
      code: ERROR_CODES.REQUEST_INVALID_CURSOR,
      title: 'Invalid cursor',
      detail,
      typeSlug: null,
    }),

  invalidParam: (detail: string) =>
    new DomainError({
      status: 400,
      code: ERROR_CODES.REQUEST_INVALID_PARAM,
      title: 'Invalid query parameter',
      detail,
      typeSlug: null,
    }),

  notAcceptable: (detail: string) =>
    new DomainError({
      status: 406,
      code: ERROR_CODES.REQUEST_NOT_ACCEPTABLE,
      title: 'Representation not available',
      detail,
      typeSlug: null,
    }),

  unprocessable: (detail: string) =>
    new DomainError({
      status: 422,
      code: ERROR_CODES.REQUEST_UNPROCESSABLE,
      title: 'Semantic conflict',
      detail,
      typeSlug: null,
    }),

  companyNotFound: (slug: string) =>
    new DomainError({
      status: 404,
      code: ERROR_CODES.COMPANY_NOT_FOUND,
      title: 'Company not found',
      detail: `No company with slug=${slug}`,
      typeSlug: 'company-not-found',
    }),

  batchNotFound: (id: string) =>
    new DomainError({
      status: 404,
      code: ERROR_CODES.BATCH_NOT_FOUND,
      title: 'Batch not found',
      detail: `No batch with id=${id}`,
      typeSlug: null,
    }),

  runNotFound: (id: string) =>
    new DomainError({
      status: 404,
      code: ERROR_CODES.RUN_NOT_FOUND,
      title: 'Run not found',
      detail: `No run with id=${id}`,
      typeSlug: null,
    }),

  iterationNotFound: (id: string) =>
    new DomainError({
      status: 404,
      code: ERROR_CODES.ITERATION_NOT_FOUND,
      title: 'Iteration not found',
      detail: `No iteration with id=${id}`,
      typeSlug: null,
    }),

  judgePromptNotFound: (version: string) =>
    new DomainError({
      status: 404,
      code: ERROR_CODES.JUDGE_PROMPT_NOT_FOUND,
      title: 'Judge prompt version not found',
      detail: `No judge prompt with version=${version}`,
      typeSlug: null,
    }),

  companyTakedownRemoved: () =>
    new DomainError({
      status: 410,
      code: ERROR_CODES.COMPANY_TAKEDOWN_REMOVED,
      title: 'Company removed',
      detail: 'This company was removed in response to a takedown request.',
      typeSlug: 'company-takedown-removed',
    }),

  deployExpired: () =>
    new DomainError({
      status: 410,
      code: ERROR_CODES.DEPLOY_EXPIRED,
      title: 'Deploy expired',
      detail: 'The 24-hour preview window has elapsed.',
      typeSlug: 'deploy-expired',
    }),

  /** Deprecated `/comments` alias guard. */
  useCompanyPath: () =>
    new DomainError({
      status: 410,
      code: ERROR_CODES.COMMENTS_USE_COMPANY_PATH,
      title: 'Endpoint removed',
      detail: 'Use GET /api/v1/comments?company_slug=<slug>.',
      typeSlug: null,
    }),

  rateLimited: (retryAfterSeconds: number) =>
    new DomainError({
      status: 429,
      code: ERROR_CODES.SERVICE_RATE_LIMITED,
      title: 'Too many requests',
      detail: 'Rate limit exceeded. Retry after Retry-After seconds.',
      retryAfterSeconds,
      typeSlug: null,
    }),

  internalError: (detail = 'Unhandled exception') =>
    new DomainError({
      status: 500,
      code: ERROR_CODES.SERVICE_INTERNAL_ERROR,
      title: 'Internal server error',
      detail,
      typeSlug: null,
    }),

  dbUnavailable: (retryAfterSeconds = 5) =>
    new DomainError({
      status: 503,
      code: ERROR_CODES.SERVICE_DB_UNAVAILABLE,
      title: 'Database unavailable',
      detail: 'Postgres connect / read failure.',
      retryAfterSeconds,
      typeSlug: null,
    }),
};
