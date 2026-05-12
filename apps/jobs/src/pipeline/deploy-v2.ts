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
      '--port', '80',
      '--memory', '256Mi',
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
//
// We deploy the simplest robust thing: one static index.html served by nginx.
// `gcloud run deploy --source` then just builds a tiny `FROM nginx` image — no
// language-buildpack guesswork (the Next.js buildpack route was flaky on
// fresh projects). The page renders the ProductSpec + manifest + cost ledger;
// nginx adds the `X-Robots-Tag` header.

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function previewHtml(args: DeployV2Args): string {
  const name = esc(args.companyName ?? args.companySlug);
  const spec = args.spec;
  const perFlow = args.develop.per_flow;
  const totalFiles = perFlow.reduce((n, e) => n + e.files_written, 0);
  const costCents = args.totalCostCents ?? args.develop.cost_cents;
  const iters = args.iterations;
  const flowRows = spec.flows.map((f, i) => `
    <div class="flow">
      <div class="flow-name">${i + 1}. ${esc(f.name)}</div>
      <div class="flow-meta"><b>trigger:</b> ${esc(f.trigger)}</div>
      <div class="flow-meta"><b>outcome:</b> ${esc(f.outcome)}</div>
    </div>`).join('');
  const fileRows = perFlow.map((e, i) => `<tr${i ? ' class="brd"' : ''}><td>${esc(e.flow)}</td><td class="r">${e.files_written} files</td></tr>`).join('');
  const receipts = [
    `<div class="rcpt"><div class="big">$${(costCents / 100).toFixed(2)}</div><div class="lbl">pipeline cost</div></div>`,
    iters != null ? `<div class="rcpt"><div class="big">${iters}</div><div class="lbl">iterations</div></div>` : '',
    `<div class="rcpt"><div class="big mono">${esc(args.runId)}</div><div class="lbl">run id</div></div>`,
  ].join('');
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>WhyC preview — ${name}</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#0b0d12;color:#e6e9ef;line-height:1.5}
main{max-width:880px;margin:0 auto;padding:48px 24px 80px}
.eyebrow{font-size:12px;color:#6b7280;letter-spacing:.1em;text-transform:uppercase}
h1{font-size:34px;margin:6px 0 4px;font-weight:700}
.pitch{font-size:18px;color:#aab3c5;margin:0}
.card{background:#12151c;border:1px solid #232a36;border-radius:12px;padding:20px;margin-top:16px}
h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a93a6;margin:0 0 10px}
.flow{padding:12px 0;border-top:1px solid #1c2230}.flow:first-of-type{border-top:0}
.flow-name{font-weight:600;margin-bottom:4px}.flow-meta{font-size:14px;color:#9aa3b5}.flow-meta b{color:#7e8a9e;font-weight:600}
table{width:100%;border-collapse:collapse;font-size:14px}td{padding:8px 0;color:#cdd3df}td.r{text-align:right;color:#8a93a6}tr.brd td{border-top:1px solid #1c2230}
.sha{margin-top:12px;font-size:12px;color:#5f6878;font-family:ui-monospace,monospace;word-break:break-all}
.rcpts{display:flex;gap:32px;flex-wrap:wrap}.rcpt .big{font-size:28px;font-weight:700}.rcpt .lbl{font-size:12px;color:#7e8a9e}.mono{font-family:ui-monospace,monospace;font-size:18px}
footer{margin-top:32px;font-size:12px;color:#4b5260}
</style></head><body><main>
<header><div class="eyebrow">WhyC · autonomous preview</div><h1>${name}</h1><p class="pitch">${esc(spec.pitch)}</p></header>
<section class="card"><h2>Who it's for</h2><p style="margin:0 0 12px">${esc(spec.persona)}</p><h2>Job to be done</h2><p style="margin:0">${esc(spec.jtbd_functional)}</p></section>
<section class="card"><h2>Flows the agent built</h2>${flowRows}</section>
<section class="card"><h2>What was generated · ${totalFiles} files</h2><table><tbody>${fileRows}</tbody></table><div class="sha">manifest sha256: ${esc(args.develop.manifest_sha256)}</div></section>
<section class="card"><h2>Receipts</h2><div class="rcpts">${receipts}</div></section>
<footer>Generated by the WhyC pipeline. No-index. Expires 24h after deploy.</footer>
</main></body></html>`;
}

function generatePreviewShell(appDir: string, args: DeployV2Args): void {
  write(appDir, 'index.html', previewHtml(args));
  // nginx adds the X-Robots-Tag header on every response
  write(appDir, 'default.conf', `server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
  location / { try_files $uri $uri/ /index.html; }
}
`);
  write(appDir, 'Dockerfile', `FROM nginx:1.27-alpine
COPY default.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
EXPOSE 80
`);
  write(appDir, '.dockerignore', 'Dockerfile\n.dockerignore\n');
}

function write(base: string, rel: string, content: string): void {
  const p = join(base, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, content);
}
