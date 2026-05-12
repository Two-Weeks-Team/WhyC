// Cron job: scrape_yc — fetch public Y Combinator company data for the demo
// dataset (master-plan-v4 Phase 9 #15).
//
// What it does: given a list of company slugs (env WHYC_YC_SLUGS, comma-
// separated, or the small default list below), fetch each company's PUBLIC page
// from workatastartup.com (falling back to ycombinator.com/companies/<slug>),
// honoring robots.txt, and extract name + one-paragraph description + batch +
// the open-roles count from the /jobs listing. Output is written to
// `data/yc-candidates.json` (one record per slug) — NOT directly into Postgres
// and NOT into prisma/seed.ts. Promoting candidates into the production dataset
// is the operator's job per docs/dataset-verification.md (the 7-check protocol:
// batch listing, slug match, verbatim public description, verifiable hire count,
// no takedown on file, no defamatory framing, no IP reproduction in the
// generated preview). This job just gathers the raw material, with provenance
// (source URL + access timestamp) so each line can be defended in writing.
//
// Zero new deps: global fetch (Node 20+), a tiny robots.txt parser, regex
// metadata extraction (no cheerio).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { _internals } from '../util/memory.js';

const UA = 'WhyC-dataset-scraper/1.0 (+https://github.com/Two-Weeks-Team/WhyC; abuse@whyc.dev)';
const WAAS = 'https://www.workatastartup.com';
const YC = 'https://www.ycombinator.com';

export interface YcCandidate {
  slug: string;
  name: string | null;
  /** ≤200-word public description (verbatim/close paraphrase). */
  description_text: string | null;
  /** The page the description was taken from. */
  description_source_url: string | null;
  language: 'en';
  /** Batch label if discoverable (e.g. "W25", "S25", "W26"). */
  batch: string | null;
  /** Open engineering/SWE/intern roles count from the /jobs page, if derivable. */
  open_roles_count: number | null;
  open_roles_source_url: string | null;
  /** ISO 8601 UTC. */
  fetched_at: string;
  /** Whatever went wrong (robots disallow, 404, gated page, …). */
  notes: string[];
}

// ─── robots.txt ──────────────────────────────────────────────────────────────

const robotsCache = new Map<string, { allow: (path: string) => boolean }>();

async function robotsFor(origin: string): Promise<{ allow: (path: string) => boolean }> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;
  let disallows: string[] = [];
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { 'user-agent': UA } });
    if (res.ok) {
      const txt = await res.text();
      // collect the Disallow rules under `User-agent: *` (and any group with `*`)
      let active = false;
      for (const raw of txt.split('\n')) {
        const line = raw.replace(/#.*$/, '').trim();
        if (!line) continue;
        const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
        if (!m) continue;
        const key = m[1]!.toLowerCase();
        const val = m[2]!.trim();
        if (key === 'user-agent') active = val === '*';
        else if (active && key === 'disallow' && val) disallows.push(val);
        else if (active && key === 'allow') { /* allow rules narrow disallows; we ignore for simplicity (conservative = honor disallow) */ }
      }
    }
  } catch {
    // network error fetching robots — be conservative but not paralysed:
    // treat as "allow" only the known-public /companies path.
    disallows = ['/'];
  }
  const allow = (path: string): boolean => {
    if (disallows.includes('/')) return path.startsWith('/companies');
    return !disallows.some((d) => d !== '' && path.startsWith(d));
  };
  const entry = { allow };
  robotsCache.set(origin, entry);
  return entry;
}

// ─── fetch + parse ───────────────────────────────────────────────────────────

async function getHtml(url: string): Promise<string | null> {
  const u = new URL(url);
  const robots = await robotsFor(u.origin);
  if (!robots.allow(u.pathname)) return null; // disallowed — skip
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow' });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html') && !ct.includes('text/plain')) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function meta(html: string, name: string): string | null {
  // matches <meta name="…" content="…"> or <meta property="…" content="…">
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i');
  const tag = re.exec(html)?.[0];
  if (!tag) return null;
  const c = /content=["']([^"']*)["']/i.exec(tag)?.[1];
  return c ? decodeEntities(c).trim() : null;
}

function title(html: string): string | null {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return t ? decodeEntities(t).replace(/\s+/g, ' ').trim() : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–');
}

function clampWords(s: string, n: number): string {
  const words = s.split(/\s+/).filter(Boolean);
  return words.length <= n ? s.trim() : words.slice(0, n).join(' ') + '…';
}

const BATCH_RE = /\b([WS])\s?(20\d{2}|2[0-9])\b|\b(Winter|Summer)\s+20(\d{2})\b/;
function findBatch(html: string): string | null {
  const m = BATCH_RE.exec(html);
  if (!m) return null;
  if (m[1]) return `${m[1]}${m[2]!.slice(-2)}`;
  if (m[3]) return `${m[3]![0]!.toUpperCase()}${m[4]}`;
  return null;
}

/** Count open engineering-ish roles by scanning the /jobs page for role titles. */
function countOpenRoles(jobsHtml: string): number | null {
  // very rough: count occurrences of common SWE/eng/intern role-title words in
  // anchor/heading text. If the page is clearly gated (login wall), return null.
  if (/sign in to (see|view)|please log in|login required/i.test(jobsHtml)) return null;
  const text = jobsHtml.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const titles = text.match(/>([^<]{0,80}?(engineer|developer|swe|software|frontend|front-end|backend|back-end|full[- ]?stack|infrastructure|ml engineer|machine learning|intern)[^<]{0,40}?)</gi) ?? [];
  // dedupe near-identical title strings
  const seen = new Set(titles.map((t) => t.replace(/[<>]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()));
  return seen.size || (titles.length ? 1 : 0);
}

async function scrapeOne(slug: string): Promise<YcCandidate> {
  const fetched_at = new Date().toISOString();
  const out: YcCandidate = {
    slug, name: null, description_text: null, description_source_url: null,
    language: 'en', batch: null, open_roles_count: null, open_roles_source_url: null,
    fetched_at, notes: [],
  };
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) { out.notes.push('slug fails ^[a-z0-9][a-z0-9-]{0,63}$ — excluded (Check 2)'); return out; }

  // primary source: workatastartup.com/companies/<slug>
  const waasUrl = `${WAAS}/companies/${slug}`;
  let html = await getHtml(waasUrl);
  let sourceUrl = waasUrl;
  if (!html) {
    out.notes.push(`workatastartup page not fetched (404 / robots / non-html) — trying ycombinator.com`);
    const ycUrl = `${YC}/companies/${slug}`;
    html = await getHtml(ycUrl);
    sourceUrl = ycUrl;
    if (!html) { out.notes.push('ycombinator.com page also not fetched — no public data, candidate cannot be used'); return out; }
  }

  out.name = meta(html, 'og:title') ?? meta(html, 'twitter:title') ?? title(html);
  if (out.name) out.name = out.name.replace(/\s*[|·–-]\s*(Y Combinator|YC|Work at a Startup).*$/i, '').trim() || out.name;
  const desc = meta(html, 'og:description') ?? meta(html, 'description') ?? meta(html, 'twitter:description');
  if (desc) { out.description_text = clampWords(desc, 200); out.description_source_url = sourceUrl; }
  else out.notes.push('no og:description/meta description on the public page — description must be sourced manually (Check 3)');
  out.batch = findBatch(html);
  if (!out.batch) out.notes.push('batch label not found in page HTML — verify manually (Check 1)');

  // hire count: /jobs listing
  const jobsUrl = `${WAAS}/companies/${slug}/jobs`;
  const jobsHtml = await getHtml(jobsUrl);
  if (jobsHtml) { out.open_roles_count = countOpenRoles(jobsHtml); out.open_roles_source_url = jobsUrl; if (out.open_roles_count === null) out.notes.push('jobs page appears gated — hire count not derivable (Check 4 → exclude)'); }
  else out.notes.push('jobs page not fetched — hire count not derivable (Check 4 → exclude)');

  return out;
}

const DEFAULT_SLUGS: string[] = [
  // intentionally a tiny seed list — the operator supplies the real W25/S25/W26
  // candidate slugs via WHYC_YC_SLUGS after picking them from the current YC
  // batch directory. These two are stable, long-standing public profiles used
  // only to smoke-test the scraper, NOT for the demo dataset.
  'stripe', 'airbnb',
];

export async function scrapeYcCompanies(slugs: string[]): Promise<YcCandidate[]> {
  const out: YcCandidate[] = [];
  for (const slug of slugs) {
    out.push(await scrapeOne(slug.trim().toLowerCase()));
    await new Promise((r) => setTimeout(r, 800)); // be polite — ~1 req/s
  }
  return out;
}

/** Cloud Run Jobs entry point (dispatched by main.ts on WHYC_JOB=scrape_yc). */
export async function run(): Promise<void> {
  const slugs = (process.env['WHYC_YC_SLUGS'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const list = slugs.length ? slugs : DEFAULT_SLUGS;
  console.warn(`[scrape-yc] fetching ${list.length} candidate(s): ${list.join(', ')}${slugs.length ? '' : ' (default smoke list — set WHYC_YC_SLUGS for the real batch)'}`);
  const candidates = await scrapeYcCompanies(list);
  const dataDir = join(_internals.ROOT, 'data');
  mkdirSync(dataDir, { recursive: true });
  const outPath = join(dataDir, 'yc-candidates.json');
  writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), scraper: UA, candidates }, null, 2) + '\n');
  const usable = candidates.filter((c) => c.name && c.description_text && c.open_roles_count !== null).length;
  console.warn(`[scrape-yc] wrote ${outPath} — ${usable}/${candidates.length} candidates have name + public description + derivable hire count. The 7-check sign-off (docs/dataset-verification.md) and the prisma/seed.ts promotion remain manual.`);
}
