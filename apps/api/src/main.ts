import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { AppModule } from '@/app.module';
import { ProblemFilter } from '@/middleware/problem.filter';
import { etagMiddleware } from '@/middleware/etag.middleware';
import { rateLimitMiddleware } from '@/middleware/rate-limit.middleware';

const ALLOWED_ORIGIN = 'https://whyc.example';
const API_PREFIX = 'api/v1';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.setGlobalPrefix(API_PREFIX);

  // CORS posture (SC7 medium): single origin in v1, GET/OPTIONS only, no credentials.
  app.enableCors({
    origin: ALLOWED_ORIGIN,
    methods: ['GET', 'OPTIONS'],
    credentials: false,
    maxAge: 3600,
  });

  // Trust proxy (Cloud Run / LB) so client IP for rate-limit middleware is correct.
  app.set('trust proxy', 1);

  // Disable x-powered-by.
  app.disable('x-powered-by');

  // Middlewares — order matters: rate-limit first, then ETag, then handlers.
  app.use(rateLimitMiddleware);
  app.use(etagMiddleware);

  // Global exception filter → RFC 7807 Problem.
  app.useGlobalFilters(new ProblemFilter());

  const port = parseInt(process.env.PORT ?? '8080', 10);
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('bootstrap');
  logger.log(`whyc-api listening on :${port} (prefix=/${API_PREFIX})`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[fatal] bootstrap failed', err);
  process.exit(1);
});
