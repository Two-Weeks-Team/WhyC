// Stage 4: deploy
//
// v1 MVP: synthesizes a deploy URL string and 24h TTL without invoking
// gcloud. Manifest-only previews are sufficient for the demo dataset.
// Real Cloud Run deployment happens in v2.
//
// TODO(v2): use @google-cloud/run ServicesClient.createService /
// updateService to push the develop-stage tarball as a buildpack source,
// then poll until READY and return the actual url + service uri. The service
// name (`whyc-preview-${run_id}`) is the idempotency key — re-deploying
// REPLACES the revision rather than appending (M17).
//
// Phoenix span: "whyc.deploy"
// Model tier:   none (no LLM call)

import { createHash } from 'node:crypto';
import { withSpan } from '../instrumentation/index.js';
import type { DeployResult, DevelopResult } from './types.js';

const TTL_MS = 24 * 60 * 60 * 1000;

export interface DeployArgs {
  run_id: string;
  region?: string;
  develop: DevelopResult;
}

export async function deploy(args: DeployArgs): Promise<DeployResult> {
  const region = args.region ?? process.env['GOOGLE_CLOUD_LOCATION'] ?? 'us-central1';
  const service_name = `whyc-preview-${args.run_id}`;

  return withSpan(
    'whyc.deploy',
    {
      'whyc.run_id': args.run_id,
      'whyc.region': region,
      'whyc.service_name': service_name,
      'whyc.artifact_sha256': args.develop.artifact_sha256,
    },
    async () => {
      // Synthetic URL — Cloud Run's real URL format includes a hash suffix per
      // revision. We mimic the shape so dashboard renderers can be tested.
      const hash = createHash('sha256')
        .update(`${args.run_id}:${args.develop.artifact_sha256}`)
        .digest('hex')
        .slice(0, 10);
      const url = `https://whyc-preview-${args.run_id}-${hash}.${region}.run.app`;

      const expires_at = new Date(Date.now() + TTL_MS).toISOString();
      const service_uri =
        `projects/${process.env['GOOGLE_CLOUD_PROJECT'] ?? 'whyc-dev'}` +
        `/locations/${region}/services/${service_name}`;

      return { url, service_name, region, expires_at, service_uri };
    },
  );
}
