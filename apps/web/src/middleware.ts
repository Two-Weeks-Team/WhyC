/**
 * Edge middleware — security headers (CSP / HSTS / Frame-Options).
 *
 * Aligned with SPEC.md §10 "Security & abuse" and SC7 (security critic):
 *   - CSP: nonce-driven; 'self' only for scripts/styles, no inline.
 *   - HSTS: 1y, includeSubDomains, preload.
 *   - X-Frame-Options: DENY (clickjacking).
 *   - Referrer-Policy: strict-origin-when-cross-origin.
 *   - Permissions-Policy: tight defaults (no camera / mic / geolocation).
 *   - X-Content-Type-Options: nosniff.
 *   - Cross-Origin-Opener-Policy / Embedder-Policy: same-origin.
 *
 * The CSP `connect-src` allows the backend Cloud Run service URL via
 * `WHYC_BACKEND_URL` env; for local dev we fall back to `*.run.app` and
 * `localhost:3000`.
 */

import { NextResponse, type NextRequest } from 'next/server';

const BACKEND_HOST = (() => {
  try {
    const u = process.env.WHYC_BACKEND_URL;
    return u ? new URL(u).origin : null;
  } catch {
    return null;
  }
})();

export function middleware(req: NextRequest): NextResponse {
  // Per-request nonce for CSP (base64url, 16 bytes).
  const nonce = generateNonce();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-csp-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  const connectSrc = [
    "'self'",
    BACKEND_HOST,
    'https://*.run.app',
    process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : null,
    process.env.NODE_ENV === 'development' ? 'ws://localhost:3001' : null,
  ]
    .filter(Boolean)
    .join(' ');

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Tailwind v4 emits inline styles via the page <style> tag at build time;
    // we accept 'unsafe-inline' on style only (no remote stylesheets).
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:`,
    `font-src 'self' data:`,
    `connect-src ${connectSrc}`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  );
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload',
  );
  // Per M6 — every page is no-index; Cloud Run preview URLs already do this
  // server-side, but the dashboard inherits the same posture.
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');

  return response;
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    // bytes[i] is well-defined here; assert for noUncheckedIndexedAccess.
    s += String.fromCharCode(bytes[i] as number);
  }
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const config = {
  // Skip Next internals + static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
