---
project: Ebb
tracker: file
plans_dir: .factory/plans
commit_plans: true
spec_paths: [docs/]
max_parallel: 3
fix_rounds: 5
models:
  planner: opus
  implementer: sonnet
  reviewer: sonnet
repos:
  - name: ebb
    dir: .
    default_branch: main
    setup: "npm install && npx playwright install chromium webkit"
    test: "npm test && npm run e2e"
    lint: "npm run lint && npm run typecheck"
    build: "npm run build"
---
Greenfield offline-first PWA ("Ebb", a contraction timer). Specs live in docs/:
- docs/implementation-spec.pdf (text extraction: docs/implementation-spec.txt) — the binding spec:
  ACs (LT/ST/HI/SD/CO/SE/SH), journeys J1–J7, edge cases, tokens, data model, stack, build order.
- docs/screens/*.png — the eight screens at 390×844 plus palette sheet and landing-rules diagram.
  Visual source of truth for layout. Spec wins for behaviour, screenshots win for layout.
- docs/design-brief.md — the original product brief (context; the implementation spec supersedes it).
The ".dc.html" canvas sources mentioned in the spec are NOT in the repo; use the screenshots.
Stack is fixed by the spec: Vite + React 18 + TS strict + Zustand + Dexie 4 + vite-plugin-pwa,
CSS Modules + one tokens.css, hand-rolled SVG charts with d3-scale/d3-array, @fontsource/nunito,
lucide-react, jspdf + svg2pdf.js lazy-loaded, Vitest + fake-indexeddb, Playwright (WebKit + Chromium).
Package manager: npm. Copy rules are hard constraints: no red, no alarms, no countdowns, no
exclamation marks, no medical labels; UK spelling, sentence case, 24-hour times.
Zero network requests after install; no analytics.
