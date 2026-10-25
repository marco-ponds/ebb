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

## Audit

`npm run audit:lighthouse` builds the app, serves it with `npm run preview` and runs Lighthouse CI
(`npx @lhci/cli`, pinned in the script, nothing added to `package.json` dependencies) three times
against `http://localhost:4173/` with a phone profile. It needs a Chrome or Chromium on the machine
(set `CHROME_PATH` if it is not found) and network access the first time, to fetch `@lhci/cli`.
`lighthouserc.json` asserts:

- the web app manifest is installable (`installable-manifest`), the PWA category is at least 0.9,
  plus `viewport` and `themed-omnibox`;
- accessibility is at least 0.95;
- performance is at least 0.90.

The pin is 0.13 because Lighthouse 12 (lhci 0.14 and later) removed the PWA audits. The audit is not
part of `npm test` or `npm run e2e`. Reports are written to `.lighthouseci/` (git-ignored).
Typical scores on a laptop: performance 0.96, accessibility 1.00, PWA 1.00.

Quality gates that run in the e2e suite (`e2e/quality/`): axe on every screen and sheet (WCAG 2.2 AA),
accessibility semantics, reduced motion, large text and landscape layout, copy rules, two tabs, offline
use, service-worker updates, and (Chromium only) tap, commit, paint, pan and virtualisation budgets.
