# prisma/ — DB engineering layer

This directory is the WhyC database engineering layer. The contract lives in
`runs/r-20260506T122526Z/specs/data-model.prisma` (locked, SHA-256
`5687a291…14524b7`). The file `prisma/schema.prisma` is byte-identical to that
locked file. Do not edit `schema.prisma` without a coordinated lock-bump
(spec → engineering re-derive).

## Layout

```
prisma/
├── schema.prisma                       # locked v1 contract — source of truth
├── seed.ts                             # deterministic dev seed (no faker)
├── README.md                           # this file
└── migrations/
    └── 0001_init/
        ├── migration.sql               # tables, columns, FKs, plain indexes
        └── check_constraints.sql       # partial uniques + Postgres CHECKs
```

The split between `migration.sql` and `check_constraints.sql` is intentional:
Prisma cannot declare partial-unique indexes or CHECK constraints natively, so
those statements live in a separate file that is applied immediately after the
generated migration. CI applies both in the same transaction.

## Database choice

- **Production / staging:** Postgres on Cloud SQL (matches SPEC §2). Connection
  string includes `?connection_limit=3&pool_timeout=10` per H-P4.
- **Dev / test:** Postgres recommended (Docker `postgres:16-alpine`). SQLite
  is acceptable for unit-level tests that don't touch:
  - the `phoenix_trace_ids TEXT[]` column (Postgres-only),
  - the partial-unique indexes (Postgres-only `WHERE` clause),
  - the `(generated_at::date)` expression-index on `public_stats_snapshots`,
  - the GIN/expression-based pattern matches in CHECK constraints.
  When running on SQLite, integration tests that exercise those features must
  be marked `@postgres-only` and skipped accordingly.

## Commands

All commands run from the repo root with the `DATABASE_URL` env set. For local
dev:

```
DATABASE_URL="postgresql://whyc:whyc@localhost:5432/whyc_dev?schema=public&connection_limit=3&pool_timeout=10"
```

| npm script           | What it runs                                                      |
| -------------------- | ----------------------------------------------------------------- |
| `pnpm db:setup`      | `prisma migrate deploy` + apply `check_constraints.sql` + seed    |
| `pnpm db:migrate:dev`| `prisma migrate dev` (creates a new migration in `migrations/`)   |
| `pnpm db:seed`       | `tsx prisma/seed.ts` — wipes and re-seeds (dev/test only)         |
| `pnpm db:reset`      | `prisma migrate reset --force` then `db:setup`                    |
| `pnpm prisma:gen`    | `prisma generate` — regenerate the typed client                   |

`db:setup` is idempotent for the constraint phase (`DROP CONSTRAINT IF EXISTS`
+ `CREATE … IF NOT EXISTS`). The migration phase is forward-only; never edit
an existing migration after merge.

## Production migration flow

1. Generate the migration in dev:
   `pnpm db:migrate:dev --name <slug>`.
2. Hand-author any partial-uniques or CHECKs into a new
   `<migration_dir>/check_constraints.sql` file.
3. Open a PR. Reviewer must verify:
   - Schema diff matches the locked `data-model.prisma` (or a new lock has
     been minted with a CHANGELOG entry).
   - No `prisma migrate dev` artifacts (e.g. `migration_lock.toml`)
     accidentally drift.
4. CI runs `prisma migrate diff` against the schema to detect drift.
5. On merge, deploy applies `prisma migrate deploy` then runs each
   `check_constraints.sql` via psql in the same DB transaction:

   ```bash
   prisma migrate deploy
   for f in prisma/migrations/*/check_constraints.sql; do
     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
   done
   ```

Zero-downtime patterns (used when the schema actually changes after v1):
- Add columns nullable first, deploy, backfill, then enforce NOT NULL.
- Add new indexes with `CONCURRENTLY` (manual SQL, not Prisma) to avoid
  locking large tables.
- Drop columns in two-stage releases: first remove all readers, then drop.

## Seed

`prisma/seed.ts` ships a deterministic 12-company demo dataset:

- 3 batches: W25, S25, W26 (synthetic Demo Day dates).
- 12 companies with synthetic slugs (`tbd-w26-01` … `tbd-w25-12`) and
  placeholder names. Real YC company names land during the WK3 scrape phase
  by replacing the `COMPANIES` array (PR-reviewed). Until then, every
  description is the literal placeholder `[TBD — replace with verified
  public-source citation during WK3 scrape phase for <slug>]` paired with a
  valid `https://www.workatastartup.com/companies/<slug>` source URL — that
  satisfies the B11 CHECK constraint (`text non-null ⇒ source_url ~ ^https?://`).
- 1 `JudgePrompt` row at version `v1`, with the 30-line judge prompt body and
  its computed SHA-256.
- ~12 comments (~1 per company) mixing `public_quote` (with `source_url`) and
  `team_note` (no source). All English, all under 1000 chars.
- One `PublicStatsSnapshot` row scoped to `2026-05-07` UTC.

The seed refuses to run when `NODE_ENV=production`. It uses no faker — every
value is a literal so the seed is byte-stable across machines.

## Query optimization notes (DB04)

These are the indexes that pay rent on the API endpoints. Cite this section
when reviewing a Prisma `.findMany()` that *doesn't* match an index — it
probably needs `select`/`include` tightening or a new index entry.

### `GET /api/v1/companies` — dashboard list (B7 + B8)

Required: a single SQL query (max 2 logical, per B7's EXPLAIN-ANALYZE
contract) that returns the row + its `current_run` summary.

Recommended Prisma shape (BE team must use this signature):

```ts
// apps/api/src/companies/companies.repo.ts
export type CompanyListItem = Prisma.CompanyGetPayload<{
  include: { currentRun: { select: typeof companyListCurrentRunSelect } };
}>;

export const companyListCurrentRunSelect = {
  id: true,
  status: true,
  startedAt: true,
  completedAt: true,
  finalSpecFit: true,
  finalSpecFitState: true,
  totalCostCents: true,
  currencyCode: true,
  deployUrl: true,
  deployExpiresAt: true,
} satisfies Prisma.RunSelect;

prisma.company.findMany({
  where: { batchId, status, takedownState: { not: 'removed' } },
  orderBy: [{ [sortKey]: sortDir }, { id: sortDir }],
  include: { currentRun: { select: companyListCurrentRunSelect } },
  take: limit + 1,
  cursor: cursorId ? { id: cursorId } : undefined,
  skip:   cursorId ? 1 : 0,
});
```

Indexes that serve it:
- Filter combos: `companies_batch_id_takedown_state_status_idx`,
  `companies_batch_id_status_idx`, `companies_status_idx`,
  `companies_takedown_state_idx`.
- Sort + tiebreaker (B8): `companies_hires_posted_count_id_idx`,
  `companies_name_id_idx`. The cursor encodes
  `base64url(JSON({k, id}))` per openapi.yaml#/components/schemas/Page.
- Sortable Run columns reached via the `currentRunId` 1:1 join:
  `runs_final_spec_fit_id_idx`, `runs_total_cost_cents_id_idx`.

N+1 trap: do NOT call `prisma.company.findMany()` then iterate to fetch
runs. The above `include.currentRun` resolves into a single LEFT JOIN.

### `GET /api/v1/companies/{slug}` — detail

```ts
prisma.company.findUnique({
  where: { slug },
  include: {
    batch: { select: { id: true, label: true, demoDayAt: true } },
    currentRun: { select: companyListCurrentRunSelect },
    comments: {
      orderBy: { postedAt: 'desc' },
      take: 50,
      select: { id: true, kind: true, body: true, bodyLanguage: true,
                authorHandle: true, sourceUrl: true, postedAt: true },
    },
  },
});
```

Index: `comments_company_id_posted_at_idx` covers the `comments` ordering.

### `GET /api/v1/runs/{run_id}/iterations` — iteration timeline

```ts
prisma.iteration.findMany({
  where: { runId },
  orderBy: { idx: 'asc' },
  include: { judgeVerdict: { select: { id: true, label: true, score: true,
                                       specFitState: true, traceId: true } } },
});
```

Index: composite unique `iterations_run_id_idx_key` doubles as the timeline
index (Postgres uses it for the ORDER BY).

### `GET /api/v1/iterations/{iter_id}/audit` — pure DB read (B9)

```ts
prisma.iteration.findUnique({
  where: { id: iterId },
  include: { judgeVerdict: true, run: { select: { id: true, judgePromptVersion: true } } },
});
```

The `phoenix_console_url` is constructed in-app from a templated base URL and
the stored `traceId`. **No Phoenix Cloud call at request time.**

### `GET /api/v1/stats`

```ts
prisma.publicStatsSnapshot.findFirst({ orderBy: { generatedAt: 'desc' } });
```

Index: `public_stats_snapshots_generated_at_idx`. Hit-rate ≈ 1 row touched.

### `GET /api/v1/comments?company_slug=…`

```ts
prisma.comment.findMany({
  where: { company: { slug } },
  orderBy: [{ postedAt: 'desc' }, { id: 'desc' }],
  take: limit + 1,
  cursor: cursorId ? { id: cursorId } : undefined,
});
```

Index: `comments_company_id_posted_at_idx`.

### Total-estimate optimization (Page.total_estimate, SC6 medium)

The `total_estimate` field on list responses is OPTIONAL and CACHED. Do NOT
run a `COUNT(*)` on the request path. Use either:
- `pg_class.reltuples::bigint` (cheap, stale up to autovacuum cadence — fine
  per the spec's "cached estimate" caveat), OR
- a nightly snapshot row similar to `PublicStatsSnapshot`.

### Index hygiene

- Every FK has an index (Prisma `@@index` on the FK column).
- Every sortable column is paired with `id` for stable cursor decoding (B8).
- Sweeper indexes: `runs_deploy_expires_at_idx`,
  `runs_deploy_revoked_at_deploy_revoked_confirmed_at_idx`.

## Coordination with other teams

- **BE (NestJS API).** The repository signatures shown above are normative.
  BE service layer must call `companyRepo.findManyWithCurrentRun()` (or the
  equivalent typed Prisma include) — direct `prisma.company.findMany()`
  without `include.currentRun` is an N+1 violation flagged by lint.
- **DevOps.** The `DATABASE_URL` env var carries `connection_limit=3` and
  `pool_timeout=10`. Multiply by Cloud Run `max-instances=5` ⇒ Postgres needs
  ≥ 15 worker connections plus headroom for cron jobs.
- **FE.** ETag derivation uses `(filter_hash, max_updated_at, total_bucket)`
  for collections per B5 — `last_hires_check_at` is EXCLUDED from
  `max_updated_at` to prevent 6h-cron-driven cache invalidation. The Prisma
  query MUST aggregate `MAX(updated_at)` over a column-list that omits
  `lastHiresCheckAt`; do not naively use `MAX(updated_at)`.

## Lock verification

Before any DB-team change, verify the lock is intact:

```bash
shasum -a 256 -c <(jq -r '.files | to_entries[] | "\(.value.sha256)  runs/r-20260506T122526Z/specs/\(.key)"' \
                      runs/r-20260506T122526Z/specs/_lock.json)
```

If the lock drifts, halt and escalate to M3 — do not silently re-derive.
