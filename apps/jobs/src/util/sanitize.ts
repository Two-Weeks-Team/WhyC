// M5 enforcement: prompt-injection sanitizer.
//
// Discrete pipeline stage that runs BEFORE every LLM call that ingests
// user-supplied content (currently the JD URL body). Its purpose:
//
//   1. strip HTML
//   2. normalize Unicode (NFKC) + strip BiDi controls + zero-width chars
//   3. cap length (≤ 8 KB body)
//   4. wrap the cleaned body in fenced delimiters that are rejected if they
//      appear in the input (prevents the attacker from forging the wrapper)
//   5. emit content_sha256 for tamper-evidence
//
// This module is the canonical implementation; pipeline/analyze.ts delegates
// here. Adversarial fixtures live at ../../../eval/sanitizer_fixtures/ and
// are wired to CI in .github/workflows/ci.yml (banned-vendor + sanitizer).

import { createHash } from 'node:crypto';
import type { SanitizedInput } from '../pipeline/types.js';
import { StageError } from '../pipeline/types.js';

const MAX_BYTES = 8 * 1024;
const SENTINEL = '<<<WHYC-SANITIZED-INPUT>>>';
const SENTINEL_END = '<<<END-WHYC-SANITIZED-INPUT>>>';

/** Ranges of Unicode controls we always strip. */
const STRIP_PATTERNS: RegExp[] = [
  // BiDi controls (LRE, RLE, PDF, LRO, RLO, LRI, RLI, FSI, PDI)
  /[‪-‮⁦-⁩]/g,
  // Zero-width: ZWSP, ZWNJ, ZWJ, BOM
  /[​-‍﻿]/g,
  // C0 controls except \n \t
  // eslint-disable-next-line no-control-regex
  /[\x00-\x08\x0B\x0C\x0E-\x1F]/g,
  // C1 controls
  // eslint-disable-next-line no-control-regex
  /[\x7F-\x9F]/g,
];

/** Pretty-loose HTML tag stripper. We don't try to parse — we just remove
 *  matched < … > sequences. False positives on `if x<y && a>b` are tolerable
 *  for JD content. */
const HTML_TAG_RE = /<[^>]+>/g;

export function sanitize(rawSourceUrl: string, rawBody: string): SanitizedInput {
  if (rawBody.includes(SENTINEL) || rawBody.includes(SENTINEL_END)) {
    throw new StageError(
      'analyze',
      'sanitizer.sentinel_in_input',
      'Input body contained the sanitizer sentinel — refuse to wrap (M5 hard fail).',
      false,
    );
  }

  const lengthIn = Buffer.byteLength(rawBody, 'utf8');

  // 1. strip HTML
  let body = rawBody.replace(HTML_TAG_RE, ' ');

  // 2. normalize + strip controls
  body = body.normalize('NFKC');
  for (const pat of STRIP_PATTERNS) body = body.replace(pat, '');

  // 3. collapse runs of whitespace
  body = body.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

  // 4. cap length
  const lengthOut = Buffer.byteLength(body, 'utf8');
  if (lengthOut > MAX_BYTES) {
    body = body.slice(0, MAX_BYTES);
  }

  const content_sha256 = createHash('sha256').update(body).digest('hex');

  return {
    source_url: rawSourceUrl,
    body,
    content_sha256,
    strip_report: {
      html_removed: rawBody.length !== rawBody.replace(HTML_TAG_RE, '').length,
      unicode_normalized: rawBody !== rawBody.normalize('NFKC'),
      length_in: lengthIn,
      length_out: Math.min(lengthOut, MAX_BYTES),
    },
  };
}

/** Wrap a sanitized body in the fenced sentinels for inclusion in an LLM
 *  prompt. The model is instructed to treat anything between the sentinels as
 *  data, never instructions. The sentinel is rejected upstream (see
 *  `sanitize`) so the attacker cannot pre-inject a fake wrapper.
 */
export function fenceForPrompt(input: SanitizedInput): string {
  return `${SENTINEL}\n${input.body}\n${SENTINEL_END}`;
}
