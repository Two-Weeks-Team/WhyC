import type { NextConfig } from 'next';

/**
 * Next.js 15 config for the WhyC web app.
 *
 * - React strict mode on.
 * - `/api/*` rewrites to the backend Cloud Run service URL (env-driven). The
 *   backend already mounts at `/api/v1` so we forward the path verbatim.
 * - Unoptimized images (we ship typography only — no remote logos per M4).
 * - Output: `standalone` so the Docker image stays small for Cloud Run.
 */
const BACKEND_BASE_URL = process.env.WHYC_BACKEND_URL ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  compress: true,
  experimental: {
    typedRoutes: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_BASE_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
