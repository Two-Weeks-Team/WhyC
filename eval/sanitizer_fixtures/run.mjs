// Sanitizer fixture harness (M5 prompt-injection — master-plan-v4 Phase 1).
//
// Feeds every case in ./cases.json through the real sanitize() implementation
// (apps/jobs/dist/util/sanitize.js — build it first via scripts/test-sanitizer.sh)
// and asserts each case's `expect` block. Exits 0 iff every case passes.
//
// Body sources, in priority order:
//   - `body`        : a literal string used verbatim
//   - `body_parts`  : array of (string | number) — numbers are Unicode code
//                     points, joined to build bodies with control / invisible
//                     chars without putting raw bytes in the JSON file
//   - `body_repeat` : [unit, count] — `unit.repeat(count)` (oversize cases)

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..', '..', 'apps', 'jobs', 'dist');

let sanitize, StageError;
try {
  ({ sanitize } = await import(join(DIST, 'util', 'sanitize.js')));
  ({ StageError } = await import(join(DIST, 'pipeline', 'types.js')));
} catch (err) {
  console.error('✗ could not import the built sanitizer from', DIST);
  console.error('  did you run `pnpm --filter @whyc/jobs run build` first?');
  console.error(' ', err?.message ?? err);
  process.exit(2);
}

const cases = JSON.parse(readFileSync(join(HERE, 'cases.json'), 'utf8'));
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

function buildBody(c) {
  if (typeof c.body === 'string') return c.body;
  if (Array.isArray(c.body_parts)) {
    return c.body_parts
      .map((p) => (typeof p === 'number' ? String.fromCodePoint(p) : String(p)))
      .join('');
  }
  if (Array.isArray(c.body_repeat)) {
    const [unit, count] = c.body_repeat;
    return String(unit).repeat(count);
  }
  throw new Error(`case "${c.name}": no body / body_parts / body_repeat`);
}

let failed = 0;
for (const c of cases) {
  const fails = [];
  const e = c.expect ?? {};
  let body;
  try {
    body = buildBody(c);
  } catch (err) {
    console.error(`✗ ${c.name}: ${err.message}`);
    failed++;
    continue;
  }

  let out, thrown;
  try {
    out = sanitize(c.source_url, body);
  } catch (err) {
    thrown = err;
  }

  if (e.throws) {
    if (!thrown) {
      fails.push('expected sanitize() to throw, but it returned a value');
    } else {
      if (!(thrown instanceof StageError)) fails.push(`thrown error is not a StageError (${thrown?.constructor?.name})`);
      if (e.throws_code !== undefined && thrown.code !== e.throws_code) fails.push(`thrown .code = ${JSON.stringify(thrown.code)}, want ${JSON.stringify(e.throws_code)}`);
      if (e.throws_retriable !== undefined && thrown.retriable !== e.throws_retriable) fails.push(`thrown .retriable = ${thrown.retriable}, want ${e.throws_retriable}`);
    }
  } else {
    if (thrown) {
      fails.push(`sanitize() threw unexpectedly: ${thrown?.message ?? thrown}`);
    } else {
      if (e.body_equals !== undefined && out.body !== e.body_equals) {
        fails.push(`body !== expected\n      got:  ${JSON.stringify(out.body)}\n      want: ${JSON.stringify(e.body_equals)}`);
      }
      for (const sub of e.body_contains ?? []) {
        if (!out.body.includes(sub)) fails.push(`body does not contain ${JSON.stringify(sub)}`);
      }
      for (const sub of e.body_not_contains ?? []) {
        if (out.body.includes(sub)) fails.push(`body unexpectedly contains ${JSON.stringify(sub)}`);
      }
      if (e.body_byte_length !== undefined) {
        const n = Buffer.byteLength(out.body, 'utf8');
        if (n !== e.body_byte_length) fails.push(`body byte length = ${n}, want ${e.body_byte_length}`);
      }
      if (e.strip_report) {
        for (const [k, v] of Object.entries(e.strip_report)) {
          if (out.strip_report?.[k] !== v) fails.push(`strip_report.${k} = ${JSON.stringify(out.strip_report?.[k])}, want ${JSON.stringify(v)}`);
        }
      }
      if (e.sha256_matches_body && out.content_sha256 !== sha256(out.body)) {
        fails.push(`content_sha256 does not match sha256(body)`);
      }
      if (e.idempotent) {
        let out2, err2;
        try { out2 = sanitize(c.source_url, out.body); } catch (err) { err2 = err; }
        if (err2) fails.push(`re-sanitizing the cleaned body threw: ${err2?.message ?? err2}`);
        else if (out2.body !== out.body) fails.push(`not idempotent — second pass changed body to ${JSON.stringify(out2.body)}`);
      }
    }
  }

  if (fails.length === 0) {
    console.log(`✓ ${c.name}`);
  } else {
    failed++;
    console.error(`✗ ${c.name}`);
    for (const f of fails) console.error(`    - ${f}`);
  }
}

const total = cases.length;
console.log(`\n${total - failed}/${total} sanitizer fixtures passed`);
process.exit(failed === 0 ? 0 : 1);
