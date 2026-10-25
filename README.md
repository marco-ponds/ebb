# Ebb — contraction timer

Offline-first, installable PWA for timing contractions. Everything stays on the device: no
accounts, no network calls after install, no analytics. Ebb records and describes; it never
diagnoses.

Specs: [`docs/implementation-spec.pdf`](docs/implementation-spec.pdf) (binding),
[`docs/screens/`](docs/screens) (layout), [`docs/design-brief.md`](docs/design-brief.md) (background).

## Development

Requires Node 22 and npm.

```sh
npm install
npx playwright install chromium webkit   # once, for the e2e suite

npm run dev          # Vite dev server
npm run build        # typecheck, production build, then the 120 kB gzip JS budget check
npm run preview      # serve dist/ on http://localhost:4173
npm test             # Vitest (jsdom, fake-indexeddb, network blocked)
npm run test:coverage
npm run e2e          # Playwright (iPhone 13 / WebKit and Pixel 7 / Chromium); builds and serves first
npm run lint
npm run typecheck
```

App icons are generated once from `public/icons/icon.svg` and committed:
`npx pwa-assets-generator --config scripts/pwa-assets.config.ts`.
