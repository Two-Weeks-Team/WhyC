# `@whyc/api` — public read API

Read-only NestJS service powering the WhyC dashboard, project detail, and
landing receipts. Implements every path in
`runs/r-20260506T122526Z/specs/openapi.yaml` (locked, v1).

## Stack

- **NestJS 10** (stock `@nestjs/common` decorators — `@Get` / `@Param`; built
  with plain `nest build`, no TS-transform plugin)
- **typia** type tags (`tags.Format<…>` etc.) for DTO documentation — type-level
  only, no runtime validation layer (no class-validator anywhere)
- **Prisma** client over Postgres (Cloud SQL); read-only DB credentials at
  runtime — pipeline jobs hold the writer role
- **TypeScript 5.4** strict, `paths` alias `@/*` → `src/*`
- **vitest** for unit + integration tests

## Layout

```
src/
  main.ts                    # bootstrap (Cloud Run port 8080)
  app.module.ts              # DI wiring
  prisma/                    # singleton PrismaService
  dto/                       # typia-tagged DTOs (1:1 with openapi.yaml schemas)
  controllers/               # thin @Get/@Param controllers
  services/                  # business logic (ETag derivation, error mapping)
  repositories/              # Prisma wrappers (no raw SQL except cron paths)
  middleware/
    etag.middleware.ts       # If-None-Match → 304 short-circuit (B5 + H-P2/3)
    rate-limit.middleware.ts # token bucket (60/min on companies+runs, 600/min on health+stats)
    problem.filter.ts        # RFC 7807 mapper with `code` extension (B3 + §8.1)
  util/
    cursor.ts                # base64url(JSON({k, id})) (B8)
    spec-fit.ts              # closed-form spec-fit formula (M11 / SPEC.md §4)
    etag.ts                  # content-hash | (id, updated_at) | collection ETags
    error-codes.ts           # closed-vocabulary code catalog
    errors.ts                # DomainError + convenience constructors
test/
  integration/
    company-description.test.ts  # B11 enforcement
    audit-no-egress.test.ts      # B9 enforcement (no Phoenix HTTP client in audit path)
  unit/
    spec-fit.test.ts
    cursor.test.ts
    etag.test.ts
```

## Local dev

```bash
# 1. install deps from repo root (pnpm workspace)
pnpm install

# 2. point at a Postgres DB and seed
export DATABASE_URL='postgresql://localhost:5432/whyc?connection_limit=3&pool_timeout=10'
pnpm --filter @whyc/api prisma generate
pnpm --filter @whyc/api prisma migrate dev

# 3. run
pnpm --filter @whyc/api start:dev

# → http://localhost:8080/api/v1/health
```

Environment variables:

| Var                       | Purpose                                                 |
| ------------------------- | ------------------------------------------------------- |
| `DATABASE_URL`            | Prisma connection string (see SPEC.md §2.1)             |
| `PORT`                    | Listen port (defaults `8080` for Cloud Run)             |
| `APP_VERSION`             | Surfaced via `/health.version`                          |
| `GIT_SHA`                 | Surfaced via `/health.commit_sha`                       |
| `PHOENIX_CONSOLE_BASE`    | Templated for `/iterations/:id/audit.phoenix_console_url`. **NEVER used to call Phoenix at request time** (B9). |
| `PHOENIX_REACHABLE_CACHED`| `'true'` / `'false'` — last cached probe value, populated by the `phoenix_health_probe` cron writing it into the runtime env (DevOps wires this via Cloud Run env-from-secret). |

## Tests

```bash
pnpm --filter @whyc/api test            # unit + integration (DB-skipped)
WHYC_INTEGRATION_DB=1 pnpm --filter @whyc/api test:integration  # requires seeded DB
```

## Deployment

Cloud Run service `whyc-web` hosts both this API and the Next.js frontend.
DevOps team owns the Cloud Run + Cloud Armor + LB wiring (SPEC.md §2 +
§10.4); this repo only ships the application binary.

Build:

```bash
pnpm --filter @whyc/api build
node apps/api/dist/main.js   # production entry
```

## Engineering invariants

- **B5 ETag.** `last_hires_check_at` is *excluded* from `meaningful_updated_at`
  (the 6h refresh cron must NOT invalidate cache). Terminal-status runs and
  the judge prompt use content-hash ETags (immutable). Collections use
  `(filter_hash, max(meaningful_updated_at), total_estimate_bucket)`.
- **B7 N+1.** `companyRepo.findManyForList` MUST `include: { currentRun: true }`.
  An EXPLAIN ANALYZE smoke test (DevOps CI) asserts ≤2 logical queries.
- **B8 cursor.** `base64url(JSON({k, id}))`. Sort field whitelist enforced
  in service layer; non-indexed sort → 400 `request.invalid_sort`.
- **B9 audit.** `/iterations/:id/audit` is a single Postgres read. No
  outbound Phoenix Cloud calls. `audit-no-egress.test.ts` greps the audit
  module graph for forbidden Phoenix-client imports.
- **B11 description.** Mapper drops the description object if `text` is
  present without a valid `source_url` (defense in depth — the Postgres
  CHECK constraint is the primary gate).

## What's *not* in scope here (other teams)

- **Pipeline agent** (Gemini ADK + Phoenix MCP) — separate Cloud Run Job, not
  this service. See SPEC.md §6.
- **Cron jobs** (scrape_yc, refresh_hires, sweep_expired_deploys, …) — Cloud
  Scheduler → Cloud Run Jobs. SPEC.md §9.
- **Cloud Armor / LB / HSTS / time-bound deploy ACL** — DevOps. SPEC.md §10.
- **Frontend** — `apps/web` (Next.js), separate package.
