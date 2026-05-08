// Entry point for every Cloud Run job in the WhyC stack.
//
// Cloud Run Jobs invoke this file with WHYC_JOB env var set to one of:
//   pipeline-kickoff | scrape-yc | sweep-deploys | refresh-hires | public-stats-rebuild
//
// The dispatcher imports the right job module lazily, runs it, and exits.
// Telemetry boots BEFORE any other import (so Vertex AI auto-instrumentation
// can attach).

import { startTelemetry } from './instrumentation/index.js';

const sdk = startTelemetry();

const KNOWN_JOBS = new Set([
  'pipeline-kickoff',
  'scrape-yc',
  'sweep-deploys',
  'refresh-hires',
  'public-stats-rebuild',
] as const);

type JobName = typeof KNOWN_JOBS extends Set<infer T> ? T : never;

function isKnownJob(s: string): s is JobName {
  return (KNOWN_JOBS as Set<string>).has(s);
}

async function loadJob(name: JobName): Promise<{ run: () => Promise<void> }> {
  switch (name) {
    case 'pipeline-kickoff':
      return await import('./jobs/pipeline-kickoff.js');
    case 'scrape-yc':
      return await import('./jobs/scrape-yc.js');
    case 'sweep-deploys':
      return await import('./jobs/sweep-deploys.js');
    case 'refresh-hires':
      return await import('./jobs/refresh-hires.js');
    case 'public-stats-rebuild':
      return await import('./jobs/public-stats-rebuild.js');
  }
}

async function main(): Promise<void> {
  const jobName = process.env['WHYC_JOB'];
  if (!jobName) {
    console.error('WHYC_JOB env var is required. One of:', [...KNOWN_JOBS].join(', '));
    process.exit(64); // EX_USAGE
  }
  if (!isKnownJob(jobName)) {
    console.error(`Unknown job "${jobName}". Known:`, [...KNOWN_JOBS].join(', '));
    process.exit(64);
  }

  console.log(`[whyc-jobs] starting job=${jobName}`);
  const t0 = Date.now();

  try {
    const { run } = await loadJob(jobName);
    await run();
    const duration = Date.now() - t0;
    console.log(`[whyc-jobs] job=${jobName} ok in ${duration}ms`);
  } catch (err) {
    const duration = Date.now() - t0;
    console.error(`[whyc-jobs] job=${jobName} FAILED in ${duration}ms`);
    console.error(err);
    process.exitCode = 1;
  } finally {
    await sdk.shutdown().catch(() => undefined);
  }
}

void main();
