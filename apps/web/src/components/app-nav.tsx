/**
 * AppNav — sticky brand-mark nav used by /dashboard and /company/[slug].
 *
 * The landing page (`/`) renders its own bespoke `<nav>` for editorial
 * fidelity with the prototype.
 */

import Link from 'next/link';

export interface AppNavProps {
  current?: 'dashboard' | 'detail' | 'methodology';
}

export function AppNav({ current }: AppNavProps) {
  return (
    <nav className="app-nav" aria-label="Primary">
      <Link href="/" className="brand" aria-label="WhyC home">
        <span className="mark" aria-hidden="true">
          W
        </span>
        WhyC
      </Link>
      <div className="links">
        <Link
          href="/dashboard"
          aria-current={current === 'dashboard' ? 'page' : undefined}
        >
          Dashboard
        </Link>
        <a href="/#method" aria-current={current === 'methodology' ? 'page' : undefined}>
          Methodology
        </a>
        <a href="/#problem">Receipts</a>
      </div>
    </nav>
  );
}
