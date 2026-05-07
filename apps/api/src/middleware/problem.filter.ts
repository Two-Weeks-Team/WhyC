import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from '@/util/errors';
import { problemTypeUri, ERROR_CODES } from '@/util/error-codes';
import type { Problem } from '@/dto/common.dto';
import { InvalidCursorError } from '@/util/cursor';

/**
 * Maps every uncaught error to RFC 7807 `application/problem+json`.
 * `code` extension is mandatory (B3 + SPEC.md §8.1).
 */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const traceId = (req.headers['x-cloud-trace-context'] as string | undefined)?.split('/')[0];
    const instance = traceId ? `urn:trace:${traceId}` : undefined;

    let problem: Problem;
    let retryAfter: number | undefined;

    if (exception instanceof DomainError) {
      problem = {
        type: problemTypeUri(exception.typeSlug),
        title: exception.title,
        status: exception.status,
        code: exception.code,
        detail: exception.detail,
        instance,
      };
      retryAfter = exception.retryAfterSeconds;
    } else if (exception instanceof InvalidCursorError) {
      problem = {
        type: 'about:blank',
        title: 'Invalid cursor',
        status: 400,
        code: ERROR_CODES.REQUEST_INVALID_CURSOR,
        detail: exception.message.replace(/^request\.invalid_cursor:\s*/, ''),
        instance,
      };
    } else if (exception instanceof HttpException) {
      // NestJS internal (e.g. payload-too-large, malformed JSON) — best-effort.
      const status = exception.getStatus();
      const resp = exception.getResponse();
      const detail =
        typeof resp === 'string'
          ? resp
          : typeof resp === 'object' && resp !== null && 'message' in resp
            ? String((resp as { message: unknown }).message)
            : 'Request failed.';
      problem = {
        type: 'about:blank',
        title: exception.message || 'Bad request',
        status,
        code: status === 404 ? ERROR_CODES.REQUEST_INVALID_PARAM : ERROR_CODES.REQUEST_INVALID_PARAM,
        detail,
        instance,
      };
    } else {
      this.logger.error('Unhandled exception', exception as Error);
      problem = {
        type: 'about:blank',
        title: 'Internal server error',
        status: 500,
        code: ERROR_CODES.SERVICE_INTERNAL_ERROR,
        detail: 'Unhandled exception',
        instance,
      };
    }

    res.status(problem.status);
    res.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
    if (retryAfter !== undefined) res.setHeader('Retry-After', String(retryAfter));
    res.json(problem);
  }
}
