// Cron: sweep_expired_deploys
//
// Runs every 5 min (deploy/cloud-run/jobs/sweep-deploys.yaml). Marks expired
// previews as revoked, then asks Cloud Run to delete the underlying service.
//
// Idempotency (SC5 H-Y2): UPDATE … SET deployRevokedAt = COALESCE(…)
// ensures only the FIRST revocation timestamp wins. SELECT … FOR UPDATE
// SKIP LOCKED guards against parallel sweeper instances grabbing the same row.
// Cloud Run delete returning 404 is treated as success.

import { PrismaClient } from '@prisma/client';
import { withSpan } from '../instrumentation/index.js';

const prisma = new PrismaClient();

interface RevokeRow {
  id: string;
  service_name: string;
  deploy_url: string | null;
}

export async function run(): Promise<void> {
  await withSpan('whyc.cron.sweep_deploys', { 'whyc.cron': 'sweep-deploys' }, async () => {
    const expiredAt = new Date();

    // SELECT … FOR UPDATE SKIP LOCKED in raw SQL — Prisma doesn't expose it.
    // We mark the rows as "claimed" by setting deployRevokedAt in the same tx,
    // then return them so the Node side can issue the Cloud Run delete.
    const claimed = await prisma.$queryRaw<RevokeRow[]>`
      WITH claim AS (
        SELECT id, service_name, deploy_url
        FROM runs
        WHERE deploy_expires_at IS NOT NULL
          AND deploy_expires_at < ${expiredAt}
          AND deploy_revoked_at IS NULL
        ORDER BY deploy_expires_at ASC
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      )
      UPDATE runs r
      SET deploy_revoked_at = ${expiredAt}
      FROM claim
      WHERE r.id = claim.id
      RETURNING r.id, r.service_name, r.deploy_url;
    `;

    if (claimed.length === 0) {
      console.log('[sweep-deploys] no expired previews');
      return;
    }
    console.log(`[sweep-deploys] claimed ${claimed.length} preview(s) for revocation`);

    // For each, ask Cloud Run to delete the service. Best-effort; we record
    // the confirmed timestamp on success. Failures stay in the table with
    // deploy_revoked_at set but deploy_revoked_confirmed_at null — the next
    // sweeper retry picks them up via a separate query.
    for (const row of claimed) {
      try {
        await deleteCloudRunService(row.service_name);
        await prisma.run.update({
          where: { id: row.id },
          data: { deployRevokedConfirmedAt: new Date() },
        });
        console.log(`[sweep-deploys] revoked ${row.service_name} (run ${row.id})`);
      } catch (err) {
        console.error(`[sweep-deploys] FAILED to delete service ${row.service_name}:`, err);
        // do not throw — continue with the rest
      }
    }
  });

  await prisma.$disconnect();
}

async function deleteCloudRunService(serviceName: string): Promise<void> {
  // Real implementation will use @google-cloud/run.
  // For local-dev / test runs we no-op.
  if (process.env['NODE_ENV'] !== 'production') {
    console.log(`[sweep-deploys][dev] would delete Cloud Run service: ${serviceName}`);
    return;
  }

  const project = process.env['GOOGLE_CLOUD_PROJECT'];
  const region = process.env['GOOGLE_CLOUD_LOCATION'] ?? 'us-central1';
  if (!project) throw new Error('GOOGLE_CLOUD_PROJECT not set');

  // Lazy import to avoid pulling the SDK in dev.
  const { ServicesClient } = await import('@google-cloud/run');
  const client = new ServicesClient();
  const name = `projects/${project}/locations/${region}/services/${serviceName}`;
  try {
    const [operation] = await client.deleteService({ name });
    await operation.promise();
  } catch (err) {
    // 404 = already gone = success per SC7-#2 fix
    const code = (err as { code?: number }).code;
    if (code === 5 /* NOT_FOUND */) return;
    throw err;
  }
}
