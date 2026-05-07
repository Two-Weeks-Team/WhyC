/**
 * Root layout for the WhyC web app.
 *
 * The landing page renders its own immersive layout via `data-page='landing'`;
 * the dashboard and detail pages share the standard `<AppNav>` brand mark.
 */

import type { Metadata, Viewport } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://whyc.example'),
  title: {
    default: 'WhyC — While they hire, we ship.',
    template: '%s · WhyC',
  },
  description:
    "An autonomous agent that ingests Y Combinator batches and ships working previews — receipts attached.",
  applicationName: 'WhyC',
  // Per M6 — every surface is no-index to prevent crawler attribution
  // confusion with the targeted YC companies.
  robots: { index: false, follow: false },
  formatDetection: { email: false, address: false, telephone: false },
  openGraph: {
    type: 'website',
    title: 'WhyC — While they hire, we ship.',
    description:
      'An autonomous agent that ingests Y Combinator batches and ships working previews.',
    siteName: 'WhyC',
  },
  other: {
    // M4 supersede — independent research disclosure exposed to crawlers
    // that ignore robots meta.
    'whyc-disclosure':
      'Independent research. Inclusion of any company name is not endorsement.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: 'oklch(97% 0.012 75)',
  colorScheme: 'light',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
