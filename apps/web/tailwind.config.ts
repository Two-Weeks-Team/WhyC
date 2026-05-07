import type { Config } from 'tailwindcss';

/**
 * Tailwind v4 config for WhyC.
 *
 * Color tokens are in OKLCH only (no hex/rgb), matching
 * `prototypes/landing-v1.html`. Tailwind v4 reads its theme from the CSS
 * `@theme` block in `globals.css` — this file pins content paths and any
 * non-token plugin behavior.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        display: [
          'Georgia',
          '"Iowan Old Style"',
          '"Times New Roman"',
          'serif',
        ],
        body: [
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'sans-serif',
        ],
        mono: [
          '"SF Mono"',
          'ui-monospace',
          '"JetBrains Mono"',
          'monospace',
        ],
      },
      colors: {
        // OKLCH tokens — exposed as Tailwind colors for utility classes.
        // The actual values live in the @theme block in globals.css; the
        // entries here exist so shadcn-style class names resolve.
        paper: 'oklch(97% 0.012 75)',
        'paper-2': 'oklch(94% 0.014 75)',
        rule: 'oklch(86% 0.012 75)',
        ink: 'oklch(18% 0.020 65)',
        'ink-soft': 'oklch(38% 0.018 65)',
        'ink-dim': 'oklch(56% 0.014 65)',
        accent: 'oklch(64% 0.182 47)',
        'accent-soft': 'oklch(94% 0.040 47)',
        good: 'oklch(56% 0.140 145)',
        warn: 'oklch(64% 0.180 35)',
      },
      letterSpacing: {
        'tightest-display': '-.03em',
        'tight-display': '-.022em',
      },
      boxShadow: {
        receipt:
          '0 1px 0 oklch(86% 0.012 75), 0 24px 48px -32px oklch(20% 0.05 65 / .25)',
      },
      screens: {
        // P07 mobile breakpoint anchor.
        mobile: { max: '960px' },
      },
    },
  },
  plugins: [],
};

export default config;
