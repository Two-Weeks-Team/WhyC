// Stage 4 (v2): deploy — real Cloud Run deployment.
//
// develop-v2 produces a *file manifest* (the v1/v2 modelling choice — turning
// the manifest into a full generated codebase is a v3-scale change). So what
// deploy-v2 ships is a small, real, self-contained Next.js "preview shell" app:
// a server-rendered page that presents the company's ProductSpec, the per-flow
// file manifest develop produced, and a receipts-style cost ledger — baked at
// generation time, zero runtime dependencies. It is buildable, deployable, and
// publicly visitable (satisfies the hackathon "hosted URL functional"
// requirement), and it sets `X-Robots-Tag: noindex,nofollow` so it never gets
// crawled.
//
// Deploy path: `gcloud run deploy whyc-preview-<runId> --source=<dir>` — Cloud
// Run's buildpacks detect Next.js, build the standalone output, push the image,
// and create the service in one step. (This requires the `gcloud` SDK, which is
// present locally / in CI / on the operator's machine; the Cloud Run *jobs*
// container doesn't ship gcloud yet — running deploy-v2 from inside that
// container is a follow-up that would use @google-cloud/run + the Cloud Build
// API. The dry-run path needs no GCP at all.)
//
// Wrapped by the pre-deploy hook (re-verifies the winner manifest SHA-256 — we
// never deploy an unattested build) and the post-stage hook.
//
// Span: whyc.deploy.v2

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trace as otelTrace } from '@opentelemetry/api';
import { withSpan } from '../instrumentation/index.js';
import { runHook, hookPassed, runDir, appendDecision } from '../util/memory.js';
import { StageError, type ProductSpec, type DevelopResultV2, type DeployResult, type HookResult } from './types.js';

const TTL_HOURS = 24;
const DEFAULT_REGION = process.env['GCP_REGION'] ?? 'us-central1';
const GCP_PROJECT = process.env['GOOGLE_CLOUD_PROJECT'] ?? process.env['GCP_PROJECT_ID'] ?? '';

function isDryRun(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  return process.env['WHYC_DRY_RUN'] === 'true' || !GCP_PROJECT;
}

/** Cloud Run service name: lowercase RFC1035, ≤63 chars. */
function serviceName(runId: string): string {
  const slug = runId.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 45);
  return `whyc-preview-${slug || 'run'}`;
}

export interface DeployV2Args {
  spec: ProductSpec;
  develop: DevelopResultV2;
  runId: string;
  iterationId: string;
  companySlug: string;
  companyName?: string;
  /** For the cost ledger on the preview page. */
  totalCostCents?: number;
  iterations?: number;
  region?: string;
  dryRun?: boolean;
}

export interface DeployV2Result {
  result: DeployResult;
  hook_results: HookResult[];
}

export async function deployV2(args: DeployV2Args): Promise<DeployV2Result> {
  const dry = isDryRun(args.dryRun);
  const region = args.region ?? DEFAULT_REGION;
  const dir = runDir(args.runId);
  mkdirSync(dir, { recursive: true });
  const svc = serviceName(args.runId);
  const hookResults: HookResult[] = [];

  // ── pre-deploy gate: the winner manifest must still hash to what Stage 3 wrote ──
  const pd = await runHook('pre-deploy', [dir, args.develop.manifest_sha256]);
  hookResults.push(pd);
  if (!hookPassed(pd)) {
    throw new StageError('deploy', 'deploy.pre_hook_refused', `pre-deploy hook refused (manifest tamper?): ${pd.stderr || pd.stdout}`, false);
  }

  return withSpan(
    'whyc.deploy.v2',
    { 'whyc.run_id': args.runId, 'whyc.service_name': svc, 'whyc.region': region, 'whyc.dry_run': dry },
    async () => {
      const expiresAt = new Date(Date.now() + TTL_HOURS * 3600 * 1000).toISOString();
      let url: string;

      if (dry) {
        // synthetic URL — same shape Cloud Run produces (<svc>-<hash>.<region>.run.app)
        const hash = Math.abs(hashString(svc)).toString(36).slice(0, 8);
        url = `https://${svc}-${hash}.${region}.run.app`;
      } else {
        if (!GCP_PROJECT) throw new StageError('deploy', 'deploy.no_project', 'GOOGLE_CLOUD_PROJECT / GCP_PROJECT_ID not set', false);
        const appDir = mkdtempSync(join(tmpdir(), `whyc-preview-${args.runId}-`));
        try {
          generatePreviewShell(appDir, args);
          url = await gcloudRunDeploySource({ svc, appDir, region, project: GCP_PROJECT });
          await healthProbe(url);
        } finally {
          rmSync(appDir, { recursive: true, force: true });
        }
      }

      const result: DeployResult = {
        url,
        service_name: svc,
        region,
        expires_at: expiresAt,
        service_uri: dry ? `projects/${GCP_PROJECT || 'whyc-prod'}/locations/${region}/services/${svc}` : `projects/${GCP_PROJECT}/locations/${region}/services/${svc}`,
      };

      writeFileSync(join(dir, 'stage-4-deploy.output.json'), JSON.stringify(result, null, 2) + '\n');
      const traceId = otelTrace.getActiveSpan()?.spanContext().traceId ?? 'null';
      const post = await runHook('post-stage', [dir, 'deploy', join(dir, 'stage-4-deploy.output.json'), traceId, String(args.totalCostCents ?? 0)]);
      hookResults.push(post);
      if (!hookPassed(post)) {
        throw new StageError('deploy', 'deploy.post_hook_refused', `post-stage hook refused deploy output: ${post.stderr || post.stdout}`, true);
      }
      appendDecision(args.runId, `deploy-v2: ${dry ? 'DRY-RUN' : 'LIVE'} ${svc} → ${url} (TTL ${TTL_HOURS}h)`);

      return { result, hook_results: hookResults };
    },
  );
}

// ─── gcloud run deploy --source ──────────────────────────────────────────────

function gcloudRunDeploySource(o: { svc: string; appDir: string; region: string; project: string }): Promise<string> {
  return withSpan('whyc.deploy.v2.gcloud_run_deploy', { 'whyc.service_name': o.svc }, () => new Promise<string>((resolvePromise, reject) => {
    const args = [
      'run', 'deploy', o.svc,
      '--source', o.appDir,
      '--project', o.project,
      '--region', o.region,
      '--allow-unauthenticated',
      '--port', '3000',
      '--memory', '512Mi',
      '--cpu', '1',
      '--max-instances', '2',
      '--min-instances', '0',
      '--timeout', '120',
      '--quiet',
      '--format', 'value(status.url)',
    ];
    const child = spawn('gcloud', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => reject(new StageError('deploy', 'deploy.gcloud_spawn_failed', `could not spawn gcloud — is the SDK installed? ${e.message}`, true)));
    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new StageError('deploy', 'deploy.cloud_run_deploy_failed', `gcloud run deploy exited ${code}: ${err.slice(-800)}`, true));
      }
      const url = out.trim().split('\n').filter(Boolean).pop() ?? '';
      if (!/^https:\/\//.test(url)) return reject(new StageError('deploy', 'deploy.no_url', `gcloud run deploy produced no URL (stdout="${out.slice(0, 200)}")`, true));
      resolvePromise(url);
    });
  }));
}

async function healthProbe(url: string): Promise<void> {
  // best-effort: the preview is a static-ish Next page; a 200 on / is enough.
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    if (!res.ok) throw new StageError('deploy', 'deploy.health_probe_failed', `deployed URL returned HTTP ${res.status}`, true);
  } catch (e) {
    if (e instanceof StageError) throw e;
    throw new StageError('deploy', 'deploy.health_probe_failed', `health probe error: ${e instanceof Error ? e.message : String(e)}`, true);
  }
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return h;
}

// ─── preview-shell generator ─────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function generatePreviewShell(appDir: string, args: DeployV2Args): void {
  const name = args.companyName ?? args.companySlug;
  const spec = args.spec;
  const perFlow = args.develop.per_flow;
  const totalFiles = perFlow.reduce((n, e) => n + e.files_written, 0);
  const data = {
    name, slug: args.companySlug, runId: args.runId,
    pitch: spec.pitch, persona: spec.persona, jtbd: spec.jtbd_functional,
    flows: spec.flows.map((f) => ({ name: f.name, trigger: f.trigger, outcome: f.outcome })),
    perFlow: perFlow.map((e) => ({ flow: e.flow, files: e.files_written })),
    totalFiles, manifestSha: args.develop.manifest_sha256,
    costCents: args.totalCostCents ?? args.develop.cost_cents,
    iterations: args.iterations ?? null,
  };

  write(appDir, 'package.json', JSON.stringify({
    name: `whyc-preview-${args.companySlug}`,
    private: true,
    version: '0.0.0',
    scripts: { build: 'next build', start: 'next start -p ${PORT:-3000}' },
    dependencies: { next: '15.0.3', react: '19.0.0', 'react-dom': '19.0.0' },
    devDependencies: { typescript: '5.6.3', '@types/react': '18.3.12', '@types/node': '22.9.0' },
  }, null, 2) + '\n');

  write(appDir, 'next.config.mjs', `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }] }];
  },
};
export default nextConfig;
`);

  write(appDir, 'tsconfig.json', JSON.stringify({
    compilerOptions: { target: 'ES2022', lib: ['dom', 'dom.iterable', 'ES2022'], jsx: 'preserve', module: 'esnext', moduleResolution: 'bundler', strict: true, noEmit: true, esModuleInterop: true, resolveJsonModule: true, isolatedModules: true, incremental: true, plugins: [{ name: 'next' }] },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  }, null, 2) + '\n');

  write(appDir, '.gitignore', 'node_modules/\n.next/\n');
  write(appDir, 'next-env.d.ts', '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n');

  write(appDir, join('app', 'layout.tsx'), `export const metadata = { title: ${JSON.stringify(`WhyC preview — ${name}`)}, robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body style={{ margin: 0, fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', background: '#0b0d12', color: '#e6e9ef' }}>{children}</body></html>);
}
`);

  write(appDir, join('app', 'page.tsx'), `// Generated by WhyC deploy-v2 — a static "preview shell" for ${esc(name)}.
const data = ${JSON.stringify(data)} as const;
const card: React.CSSProperties = { background: '#12151c', border: '1px solid #232a36', borderRadius: 12, padding: 20, marginBottom: 16 };
const h2: React.CSSProperties = { fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a93a6', margin: '0 0 10px' };
export default function Page() {
  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: '48px 24px 80px' }}>
      <header style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>WhyC · autonomous preview</div>
        <h1 style={{ fontSize: 34, margin: '6px 0 4px', fontWeight: 700 }}>{data.name}</h1>
        <p style={{ fontSize: 18, color: '#aab3c5', margin: 0, lineHeight: 1.5 }}>{data.pitch}</p>
      </header>
      <section style={card}>
        <h2 style={h2}>Who it's for</h2>
        <p style={{ margin: '0 0 12px' }}>{data.persona}</p>
        <h2 style={h2}>Job to be done</h2>
        <p style={{ margin: 0 }}>{data.jtbd}</p>
      </section>
      <section style={card}>
        <h2 style={h2}>Flows the agent built</h2>
        {data.flows.map((f, i) => (
          <div key={i} style={{ padding: '12px 0', borderTop: i ? '1px solid #1c2230' : 'none' }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{i + 1}. {f.name}</div>
            <div style={{ fontSize: 14, color: '#9aa3b5' }}><b style={{ color: '#7e8a9e' }}>trigger:</b> {f.trigger}</div>
            <div style={{ fontSize: 14, color: '#9aa3b5' }}><b style={{ color: '#7e8a9e' }}>outcome:</b> {f.outcome}</div>
          </div>
        ))}
      </section>
      <section style={card}>
        <h2 style={h2}>What was generated · {data.totalFiles} files</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <tbody>
            {data.perFlow.map((e, i) => (
              <tr key={i} style={{ borderTop: i ? '1px solid #1c2230' : 'none' }}>
                <td style={{ padding: '8px 0', color: '#cdd3df' }}>{e.flow}</td>
                <td style={{ padding: '8px 0', textAlign: 'right', color: '#8a93a6' }}>{e.files} files</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12, fontSize: 12, color: '#5f6878', fontFamily: 'ui-monospace, monospace' }}>manifest sha256: {data.manifestSha}</div>
      </section>
      <section style={{ ...card, marginBottom: 0 }}>
        <h2 style={h2}>Receipts</h2>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 28, fontWeight: 700 }}>{'$' + (data.costCents / 100).toFixed(2)}</div><div style={{ fontSize: 12, color: '#7e8a9e' }}>pipeline cost</div></div>
          {data.iterations != null && <div><div style={{ fontSize: 28, fontWeight: 700 }}>{data.iterations}</div><div style={{ fontSize: 12, color: '#7e8a9e' }}>iterations</div></div>}
          <div><div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>{data.runId}</div><div style={{ fontSize: 12, color: '#7e8a9e' }}>run id</div></div>
        </div>
      </section>
      <footer style={{ marginTop: 32, fontSize: 12, color: '#4b5260' }}>Generated by the WhyC pipeline. No-index. Expires 24h after deploy.</footer>
    </main>
  );
}
`);
}

function write(base: string, rel: string, content: string): void {
  const p = join(base, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, content);
}
