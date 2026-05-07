# @whyc/web — WhyC web application

Next.js 15 App Router app with three surfaces:

- `/` — Editorial landing page (P18 composite). Pixel-fidelity port of
  `runs/<id>/prototypes/landing-v1.html`.
- `/dashboard` — P06 dense leaderboard. Sortable, filterable, sticky
  header/column, sparkline per row.
- `/company/[slug]` — Project detail. P10 hero + P13 KPI tiles + P04 cost
  ledger + P15 read-only reaction wall.

## Stack

- Next.js 15 + React 19 (typed routes, App Router)
- TypeScript strict (`noUncheckedIndexedAccess`, `noImplicitOverride`)
- Tailwind v4 with OKLCH design tokens (no hex/rgb)
- @tanstack/react-query for server-state caching (client-side)
- Zustand for client filter/sort state
- Edge middleware for CSP / HSTS / X-Frame-Options

## Local development

```bash
pnpm install
pnpm dev          # http://localhost:3001
pnpm typecheck
pnpm lint
pnpm build
pnpm start        # standalone production server
```

The dev server proxies `/api/*` to the backend through `next.config.ts`'s
`rewrites()` block. Set `WHYC_BACKEND_URL` in your shell:

```bash
export WHYC_BACKEND_URL=http://localhost:3000
```

When unset, the proxy targets `http://localhost:3000` (NestJS local default).

## Production deploy (Cloud Run)

The app builds in `output: 'standalone'` mode, so the Docker image only
needs the `.next/standalone` directory + `public/` + `.next/static`.
DevOps's `Dockerfile` consumes this layout:

```Dockerfile
FROM node:20-slim AS runner
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
ENV PORT=8080
CMD ["node", "apps/web/server.js"]
```

Required env vars at runtime:

| Var | Purpose |
|---|---|
| `WHYC_BACKEND_URL` | Cloud Run URL of `apps/api` (NestJS service). |
| `NEXT_PUBLIC_API_BASE` | Optional client-side base; defaults to same-origin `/api`. |
| `PORT` | Cloud Run injects this; we honor `8080`. |

## Source layout

```
apps/web/
├── src/
│   ├── app/
│   │   ├── layout.tsx            # root layout + meta
│   │   ├── page.tsx              # landing (port of landing-v1.html)
│   │   ├── not-found.tsx
│   │   ├── dashboard/
│   │   │   ├── page.tsx          # SSR shell + data fetch
│   │   │   ├── dashboard-table.tsx  # client filter/sort
│   │   │   ├── loading.tsx
│   │   │   └── error.tsx
│   │   └── company/[slug]/
│   │       ├── page.tsx          # detail SSR
│   │       └── loading.tsx
│   ├── components/
│   │   ├── app-nav.tsx           # shared brand nav
│   │   ├── receipt-card.tsx      # reusable receipt
│   │   ├── spec-fit-bar.tsx      # accessible progress
│   │   ├── sparkline.tsx         # SVG + SR table fallback
│   │   ├── page-pagination.tsx   # cursor pager + live region
│   │   └── wall.tsx              # read-only P15 reactions
│   ├── lib/api/
│   │   ├── client.ts             # typed fetch + ETag
│   │   └── types.ts              # OpenAPI types (hand-typed v1)
│   ├── state/
│   │   └── dashboard-filters.store.ts
│   ├── styles/
│   │   └── globals.css           # OKLCH tokens + scoped landing CSS
│   └── middleware.ts             # CSP / HSTS / frame-options
├── tailwind.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── next.config.ts
└── package.json
```

## A11y posture (WCAG 2.2 AA)

- Universal `:focus-visible` ring (2px accent, 4px offset).
- All progress bars carry `role=progressbar` + canonical aria-label per
  `SpecFitState` template (`"Spec-fit <int>%, <label>"`).
- Sparklines are `aria-hidden` SVG with a paired `<table.sr-only>` for
  SR users.
- `prefers-reduced-motion` disables the receipt-bar fill animation.
- Landing nav links + skip-target IDs are keyboard navigable.
- All `target=_blank` links have `rel="noopener noreferrer"` plus an
  SR hint "(opens in a new window)".
- BCP-47 `lang` attributes are emitted on `description.text` and
  `comment.body.text` blocks per `Company.description.language` /
  `Comment.body.language` from the API.
- Mobile breakpoint at 960px; every view is navigable at 375px width.

## Notes

- No remote logos are loaded anywhere (M4 supersede). All identity is
  typographic.
- The hero "While they hire, we ship." headline is the brand voice
  decision recorded in `runs/<id>/design-approved.json` and is
  intentional.
- Footer disclaimer text is verbatim from the prototype (M4 supersede).
