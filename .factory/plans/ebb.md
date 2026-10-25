---
feature: ebb
status: approved
---
# Ebb v1: offline-first contraction-timer PWA

**Spec:** docs/implementation-spec.pdf (text: docs/implementation-spec.txt). Layout source: docs/screens/01–10*.png. Design-review answers and folded-in suggestions: .factory/plans/ebb.design-answers.md. docs/design-brief.md is background only and is superseded.
**Goal:** Ship the full v1 of Ebb as a static, installable, offline-first PWA (Vite + React 18 + TS strict + Zustand + Dexie 4). It covers every AC (LT, ST, HI, SD, CO, SE, SH), journeys J1–J7 and every edge-case row, and each one has a passing test.

## Summary
The repo has docs only, so this builds Ebb from nothing. Wave 1 sets up the whole toolchain and the PWA shell. Wave 2 builds three shared foundations in parallel: pure domain maths, the Dexie repositories with the store, undo and backup, and a UI kit of components plus SVG charts. Wave 3 builds the lifecycle with Welcome and Start, Live core, and History with Compare. Wave 4 adds Live interactions, Session detail with export, and Settings with data. Wave 5 is a quality-gates task: J7, a11y, performance, offline and multi-tab checks. Wave 6 is a human verification task for the checks only a person on a real device can do. Each journey's Playwright spec belongs to the task that completes the journey.

## Decisions
- Navigation during an active session: the Live header has a small icon button in the same style as Start's icon button. It opens a sheet with "All sessions" and "Settings". `#/` redirects to `#/live` while a session is active. Back on History and Settings returns to Live when a session is active. (source: human)
- Undo on Session detail: deletes and edits show the toast "Deleted · Undo" / "Saved · Undo" for about 5 s. It uses the same depth-1 undo slot as Live's Undo. (source: human)
- Event save: the Event sheet switches to a confirmation state ("Saved · Waters broke, green or brown, 23:30") and shows the gentle prompt below it when it applies. It has a Done button and closes only when Done is tapped. The prompt sits in a role="status" region. (source: human)
- HoldToConfirm also works by holding Space or Enter. An assistive-technology activation (a click with no hold, e.g. a VoiceOver double-tap) opens the "End this session?" sheet directly. Delete is also in the row edit sheet. The strength picker's 30 s auto-dismiss pauses while focus is inside it. Undo has `aria-disabled` when there is nothing to undo. (source: human, folded-in)
- "Lasting" everywhere; the screenshot's "Last lasted" is not used. The breathing caption is hidden when Breathing glow is off or prefers-reduced-motion is set. The threshold banner uses "Matches the threshold you set — {name}"; the screenshot's "from your plan with the midwife" is a mock-up artefact. Strength appears in the Settings-chosen format in the log and compare tables. "1m 02s" in the picker header is the length of the contraction that just ended. (source: human, folded-in)
- Custom threshold editor: type (N in M minutes | A-L-D), values, optional label. Custom thresholds can be edited and deleted. Inputs are validated; Save is disabled with an inline hint when invalid. (source: human, folded-in)
- Restore → Replace takes an automatic JSON snapshot into the backups cache first and shows a confirmation line. Restore is disabled during an active session, with a hint. (source: human, folded-in)
- Default session name: the part of day is morning 05:00–11:59, afternoon 12:00–16:59, evening 17:00–20:59, night 21:00–04:59, taken from the start time on the start's weekday ("Sunday night" for Sun 02:10, "Tuesday evening" for 19:05). An **active** unnamed session shows a relative name instead: "Tonight" (evening/night), "This morning", "This afternoon". The screenshots show "Tonight" only on the active session. (source: planner)
- Extra fields beyond the spec's table are non-indexed, so the Dexie version stays 1: `Contraction.timeChanged`, `Contraction.reviewed`, `Contraction.updatedAt`, `EbbEvent.note`, `EbbEvent.updatedAt`, `Session.thresholdMetAt`. Optional fields are stored as `null`, not omitted. (source: planner)
- "Very short" (<5 s) and "time changed" contractions are excluded from all derived averages, regularity and progression until they are saved through the edit sheet, which sets `reviewed: true`. The log tags them "very short" / "time changed". Stored timestamps are never rewritten or reordered automatically, which is how "keep insertion order" is honoured. Counts (per 10 min, N in M, totals) include every non-deleted start. (source: planner)
- Gap detection needs at least 3 previous intervals. It uses the median of up to the previous 5. (source: planner)
- Settings and undo stores use the out-of-line key `'singleton'`. (source: planner)
- Formatting: `formatDuration` zero-pads seconds and drops zero parts ("5m 05s", "4m", "1 h 15 m", "2 h"). Session length is "40 m" under 1 h and "2 h 19 m" from 1 h. Times are always 24-hour HH:mm in v1. (source: planner, from screenshots)
- Summary text: interval in minutes to 1 decimal with a trailing ".0" dropped ("4.5 min"); duration in whole seconds ("55 s"); strength rounded to an integer. The strength clause is omitted when nothing is rated. `{events}` lists every non-deleted event of the session in time order, one sentence each. Ended sessions use the prefix "Whole session:" instead of "Last hour:". (source: planner)
- During a contraction, "Started by mistake" always discards the in-progress contraction (hard delete) and clears the undo slot. Starting and ending a session also clear the slot. Renaming and notes autosave never touch the slot. (source: planner)
- The "Still going?" card shows whenever the in-progress contraction's elapsed time is over 5 min, including on reopen; Keep timing hides it for that contraction. The "Contractions paused?" card shows whenever the session is resting, has at least 1 contraction, and the last start was 60+ min ago; Keep session going hides it until the next contraction. (source: planner)
- A-L-D: the ±5 s tolerance applies to both interval and duration checks. Banner dismissal is kept in memory only. (source: planner)
- Backup excludes soft-deleted rows. Import closes any imported session with `endedAt: null` at its latest timestamp, drops imported contractions with `endAt: null` (counted as skipped), and skips id conflicts for contractions/events unless the incoming `updatedAt` is newer. Merge keeps the device's settings; Replace takes the backup's settings but keeps the device's `onboardedAt`. (source: planner)
- Filenames: `ebb-backup-YYYY-MM-DD.json` (export date), `ebb-session-YYYY-MM-DD.csv` / `.pdf` (session start date). Files are saved by anchor download; Web Share with files is used only when downloads are unavailable (iOS standalone). (source: planner)
- The third Compare series is drawn as a `--text-muted` dotted outline. Compare column headers use the first word of the display name ("Tonight", "Tuesday"). (source: planner, from screenshot 07)
- Fonts: own `@font-face` with `font-display: block` over the @fontsource woff2 files, plus `<link rel="preload">` for the weights used on Live. Fonts are precached, so the block period resolves from cache well under 300 ms; no CSS value expresses "block for at most 300 ms" exactly. (source: planner)
- Service-worker updates: `registerType: 'prompt'`, no `skipWaiting`/`clientsClaim`. `updateSW(true)` is never called while a session is active. On a cold start with no active session and a waiting worker, call `updateSW(true)`. Settings shows "Update ready — restart the app to use it" while a worker is waiting. (source: planner)
- Storage unavailable (private mode): Dexie is re-created over a lazily imported in-memory `fake-indexeddb` (status `memory`), so the same repository code runs. (source: planner)
- The >300 ms skeleton is generic (card outlines plus a big `--surface-2` button), because the target screen isn't known until the read finishes. (source: planner)
- Day theme: `--bg #F7F4FB`, `--surface #FFFFFF`, `--surface-2 #EEE8F7`, `--text #2A2442`, `--text-muted #4F4868`, `--text-faint #625B7D`, `--hairline #DCD4EA`, with pastels at 100 % for fills. The implementer must verify 4.5:1 for these. (source: planner, per spec's Light-mode decision)
- The Session detail Export button opens a sheet with "PDF report" and "CSV data". Rest appears in the chart tooltip and the edit sheet. (source: planner)
- The JS budget is checked at build time by walking the Vite manifest's static import graph from the entry, so dynamic imports such as jspdf and svg2pdf are excluded. (source: planner)
- All runtime and dev dependencies are installed in Task 1. Later tasks must not edit package.json or package-lock.json, except Task 11 adding scripts. (source: planner)
- A `Type: human` verification task (Task 12) is included. The Definition of Done asks for a VoiceOver pass, a side-by-side visual match against the screenshots, a real-device install with airplane mode, and Lighthouse scores, and none of these can be fully automated in CI. (source: planner)
- Contracting layout (screenshot 02) hides the averages card, pattern line, mini timeline, Share and the end-session control. Rating layout (screenshot 03) hides the stat cards, averages, pattern line, mini timeline and end control while the picker is open. (source: planner, from screenshots)
- Copy the spec doesn't give, written by the planner: Live menu sheet "All sessions" / "Settings"; end sheet summary "{n} contractions over {length}"; pattern-card empty state "Not enough yet to describe a pattern"; edit end-before-start hint "The end needs to be after the start"; wake-lock help "This browser can't keep the screen on. You can raise the auto-lock time in your phone's display settings."; hold-to-end reduced-motion text "Keep holding · 1.5 s" → "1.0 s" → "0.5 s"; persist-denied nudge = the backup button rendered with the butter tint panel. (source: planner)

## Global Constraints

**Hard rules (spec, verbatim)**
- "Treat the screenshots and the Design tokens section as the visual source of truth." "When this spec and the screenshots disagree, the spec wins for behaviour and the screenshots win for layout."
- "Store raw timestamps only. Every number on screen is derived." "Never add red, alarms, countdowns or medical labels. The Copy rules section is a hard constraint, not a style preference."
- "Write each tap to disk before updating the UI, so a crash or a lock never loses a tap. All times are epoch milliseconds (UTC); display uses the device's local time zone."
- No accounts, no network calls after install, no analytics or crash reporting. "Privacy: zero network requests after install (verify with a test that fails on any fetch)."
- Every Playwright spec imports `test`/`expect` from `e2e/fixtures.ts`, which fails the test on any request to another origin.
- No dependency changes after Task 1 (Task 11 may add scripts only).

**Stack:** Vite + TypeScript strict; React 18; CSS Modules + one `src/styles/tokens.css` of custom properties; Zustand store derived from Dexie live queries ("The DB is the source of truth; the store only caches"); Dexie 4; vite-plugin-pwa (Workbox `generateSW`, `registerType: 'prompt'`); hand-rolled SVG charts + d3-scale / d3-array only; @fontsource/nunito 600/700/800/900 latin subset; lucide-react; jspdf + svg2pdf.js dynamically imported; Vitest + fake-indexeddb; Playwright with WebKit (iPhone 13) and Chromium (Pixel 7). npm.
Module layout: `src/db/` (schema, migrations, repositories, undo log), `src/domain/` (pure functions, 100 % unit-tested, no DOM), `src/app/` (router, lifecycle, SW update), `src/screens/` (Live, Start, History, SessionDetail, Compare, Settings, Welcome), `src/components/`, `src/charts/`, plus `src/state/` (Zustand) and `src/lib/` (small hooks/utils).

**Tokens (put every value in tokens.css; use nothing outside it)**
Colours: `--bg` #1B1929 (Dusk, page) · `--surface` #252238 (Cushion, cards) · `--surface-2` #2F2B45 (Pillow, secondary buttons, table dividers) · `--hairline` #3A3553 (grid lines, inactive tracks) · `--text` #F1ECF8 (Moonlight) · `--text-muted` #B3ACCB (labels) · `--text-faint` #8C85A8 (captions) · `--ink` #2A2442 (text on any pastel) · `--lavender` #CBBBF4 (ready/resting, primary actions, contraction bars) · `--peach` #F7C9B5 (contraction in progress; duration chart) · `--mint` #AEDFCF (events, "screen stays on", regularity meter) · `--butter` #F1E0AA (user thresholds and banner; intensity chart) · `--sky` #B4CAF0 (second series, per-10-min bars) · `--rose` #F2B8C6 ("Destructive text only (Delete all data). Never a fill.").
"Tinted panels use the accent at 10–16 % alpha on --surface, for example the threshold banner rgba(241,224,170,0.12)." "No pure white, red or flashing." prefers-contrast: more → `--text-muted` #D6D0E8.
Type: Nunito, fallback `'Nunito', ui-rounded, 'SF Pro Rounded', system-ui, sans-serif`; every number `font-variant-numeric: tabular-nums`. Hero timer 76–92 px / 900, letter-spacing −1 to −2 px · Stat value 36–40 px / 900 · Button label 22–30 px / 900 · Screen title 22 px / 900 · Card title 16–19 px / 900 · Body 14–15 px / 600–700 · Caption 12–13 px / 600–800. Minimum 12 px.
Shape: "hero button 48, cards 26–30, buttons 20, small icon buttons 18, pills 999, circular contraction button 50 %". "4-pt base; the screen gutter is 20 px, gaps between cards 10–16 px." "Touch targets: at least 48 × 48 px; the main button fills all spare vertical space (at least 240 px tall)." "Halo: the hero button has two soft rings in its own colour, at 10 % (10 px) and 5 % (22 px). No drop shadows, no gradients."
Motion: "Breathing glow: an 8 s ease-in-out loop that scales 0.94 → 1.04 at 35 → 90 % opacity behind the contraction button. It is disabled under prefers-reduced-motion and by the Settings toggle." "Transitions: 200–250 ms ease-out colour crossfade between resting and contracting. No bounces, shakes or flashes anywhere." Icons: "2–2.4 px stroke, rounded caps and joins (Lucide)". No emoji. Focus rings: 3 px lavender, 2 px offset, `:focus-visible` only.

**Copy rules (hard)**
- Do: "every 4–6 min over the last hour"; "getting closer together", "steady", "easing off"; "Matches the threshold you set"; "If you haven't already, contact your midwife or maternity unit."; "Contractions paused?"
- Never: "You are in active labour" / "early labour"; "Braxton Hicks", "false labour", "progressing well"; "Time to go to hospital", "Call now!"; red text, warning icons, sirens, countdowns, exclamation marks; "Labour has stopped".
- "Voice: warm, plain, brief, second person. Use sentence case. Use UK spelling and 24-hour times by default."
- Safety line (verbatim, on Welcome, Start and Settings): "This app records contractions. It doesn't give medical advice — if you're worried, contact your midwife or maternity unit."
- Gentle prompt (verbatim), after bleeding, reduced baby movement, or waters green or brown: "If you haven't already, contact your midwife or maternity unit." It has no colour change, no icon and no countdown.

**Data model: IndexedDB database `ebb`, Dexie version 1**
- sessions (key `id` UUID v4): name, startedAt, endedAt (null = active), notes, createdAt, updatedAt, thresholdMetAt. Indexes `startedAt`, `endedAt`.
- contractions (key `id`): sessionId, startAt, endAt (null = in progress), intensity (1–10 or null), note, deletedAt, timeChanged, reviewed, updatedAt. Indexes `sessionId`, `[sessionId+startAt]`.
- events (key `id`): sessionId, at, type, details, note, deletedAt, updatedAt. Index `[sessionId+at]`.
- settings (key `'singleton'`): thresholds[], intensityScale (`words|numeric|both`), theme (`night|day|system`), keepAwake, haptics, breathingGlow, lastBackupAt, onboardedAt.
- undo (key `'singleton'`): the last reversible action (type + snapshot).
- Event types: `waters` (details `clear|pink|green-brown|unsure`), `bleeding`, `reduced-movement`, `called-midwife`, `went-to-hospital`, `note`.
- "Invariants: at most one session with endedAt = null; at most one contraction with endAt = null, and only in the active session."
- "Soft delete: deletes set deletedAt, so Undo can restore them; queries filter these out. Hard-delete soft-deleted rows when their session ends plus 24 h."
- "Intensity: stored as 1–10 whatever scale is shown. The five-word scale maps Mild 2, Medium 4, Strong 6, Very strong 8, Intense 10."
- Schema changes only by forward migrations, with an automatic JSON snapshot into the backups cache first.

**Derived metrics (finished, non-deleted contractions ordered by startAt)**
- duration_i = end_i − start_i; interval_i = start_i − start_{i−1}; rest_i = start_i − end_{i−1}. "Time apart (UI label) = interval. Rest is shown only in session detail."
- "Rolling averages over the last 30 and 60 min: the mean of intervals whose start falls in the window. Show — until there are at least 2 intervals."
- "Per 10 min: the count of contraction starts in [now − 10 min, now); charts use fixed 10-min buckets from the session start."
- "Regularity = the coefficient of variation of intervals in the last 60 min, needing at least 4 intervals. CV < 0.20 → Regular; 0.20–0.40 → Fairly regular; > 0.40 → Irregular. Always show the range too ("every 4–6 min", the 10th–90th percentile, rounded to whole minutes)."
- "Progression: the least-squares slope of interval, duration and intensity against start time over the last 60 min (at least 5 points). Interval slope < −0.5 min/h → "getting closer together"; > +0.5 → "getting further apart"; else "steady". Duration slope beyond ±5 s/h → "getting longer" or "getting shorter". Intensity slope beyond ±0.5/h → "getting stronger" or "easing off"."
- "Gap: an interval more than 2.5 × the median of the previous 5, and at least 15 min. Draw it as a dashed empty box on the timeline. Exclude it from regularity and progression."
- "Formatting: under 60 s → 58s; under 60 min → 4m 10s; otherwise 1 h 15 m. Timers on buttons use m:ss (and h:mm:ss past 1 h)."
- Thresholds: "Evaluate all enabled thresholds after each contraction ends, after an edit, and every 60 s. N in M: at least N contraction starts in the last M minutes. A-L-D: every interval ≤ A min and every duration ≥ L min (±5 s tolerance) across the last D hours, with at least (D × 60 / A) − 1 contractions in that window and no gap. When a threshold is met, show the banner "Matches the threshold you set — {name}", with the user's custom label if set. If several are met, show the first in list order. Record the first match time per session as a timeline marker ("Threshold met")."
- Presets: 3 in 10 min; 5-1-1; 4-1-1; 3-1-1, all off by default.
- Summary (SH-01): "Last hour: {n} contractions, every {interval}, lasting about {duration}, strength about {i}/10. {events}". Example: "Last hour: 12 contractions, every 4.5 min, lasting about 55 s, strength about 6/10. Waters broke 23:30, clear."
- CSV (SH-03): columns `type,start,end,duration_s,interval_s,intensity,note`, ISO 8601 local time with offset.
- Backup (SH-04): `{app:"ebb", schema:1, exportedAt, sessions[], contractions[], events[], settings}`. Import validates the schema version and IDs and de-duplicates by `id`. Corrupt or wrong version → "This file isn't an Ebb backup", change nothing.

**Routes (hash):** `#/`, `#/live`, `#/history`, `#/session/:id`, `#/compare?ids=a,b`, `#/settings`. Landing: (1) no onboardedAt → Welcome; (2) a contraction with endAt = null → Live contracting, elapsed = now − startAt; (3) a session with endedAt = null → Live resting; (4) otherwise → Start. "If the IndexedDB read takes longer than 300 ms, show a skeleton of the target screen: card outlines plus the big button in --surface-2, with no text and no spinner. Never show a blank or white frame. Set background-color: #1B1929 on html in the inline critical CSS."

**Lifecycle:** Wake lock: request `navigator.wakeLock.request('screen')` on session start and whenever the app becomes visible with an active session (if Keep screen awake is on); re-acquire on every visibilitychange to visible; release on session end. The pill reads "Screen stays on" (mint) while the lock is held, otherwise "Screen may sleep" (`--text-faint`), with no alert. Timers tick with requestAnimationFrame, throttled to 1 Hz, and always compute from stored timestamps. Rolling stats recompute on every tap and every 15 s. Never rely on beforeunload or pagehide. Never end a session automatically.

**PWA:** Manifest name "Ebb — Contraction Timer", short_name "Ebb", `display: standalone`, `orientation: any`, `background_color` and `theme_color` #1B1929. Icons 192, 512, maskable 512, Apple touch 180. Meta: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style: black-translucent`, `viewport-fit=cover`, safe-area insets padding top and bottom. Precache everything at install; runtime cache-first for same-origin assets. A new version never activates or reloads during an active session.

**A11y (WCAG 2.2 AA):** text ≥ 4.5:1; pastel fills carry `--ink` text. Use real `<button>`, `<a>`, `<input>`, `<label>`, `<table>` with `<th scope>`. Toggles are `role="switch"` with `aria-checked`; the strength picker is a `radiogroup`. The hero button's accessible name includes state and time, e.g. "Start contraction. 3 minutes 42 seconds since the last one started". An `aria-live="polite"` region announces "Contraction started" and "Contraction ended, lasted 58 seconds". Charts have `role="img"` with a sentence summary. Intensity and series are never encoded by colour alone. Respect prefers-reduced-motion and prefers-contrast: more.

**Performance:** first paint < 500 ms on cached reopen; interactive < 1 s; JS < 120 kB gzipped excluding the lazy PDF library; tap visual response < 100 ms; DB commit < 50 ms p95; computations < 16 ms on a 24 h / 300+ contraction session (memoise per session); charts 60 fps; log virtualised. Battery: no animation besides the 1 Hz timer and the CSS-only glow, which pauses when hidden.

**Commands (factory):** setup `npm install && npx playwright install chromium webkit`; test `npm test && npm run e2e`; lint `npm run lint && npm run typecheck`; build `npm run build`.

## Waves
- Wave 1: Task 1
- Wave 2: Task 2, Task 3, Task 4 (each needs 1)
- Wave 3: Task 5, Task 6, Task 7 (each needs 2, 3, 4)
- Wave 4: Task 8 (needs 5, 6), Task 9 (needs 5, 6, 7), Task 10 (needs 5, 6)
- Wave 5: Task 11 (needs 8, 9, 10)
- Wave 6: Task 12 (human; needs 11)

## Open questions left unresolved (non-blocking)
- Final name and app icon. Task 1 ships a placeholder lavender "ebb" icon; swapping it later changes only public/icons.
- The Day theme screens aren't drawn yet. The planner derived the values (Decisions); a redesign touches only tokens.css.
- Localisation (US 12-hour times, "OB/provider" wording) is deferred. Formatting is centralised in src/domain/format.ts, so it is cheap to change later.
- iOS `apple-touch-startup-image` splash images are not in v1; iOS shows the dark background colour instead. This is cosmetic.
- Lighthouse is run by a script (Task 11) and by a human (Task 12), not in the factory test command, because it is too slow and flaky for CI.

## Tasks

### Task 1: Scaffold, tokens, PWA shell, Dexie schema, router and test harness
- Type: code
- Goal: Create a building, linting, testing and offline-capable app shell so every later command and task works.
- Owns: package.json, package-lock.json, tsconfig*.json, vite.config.ts, vitest.config.ts, playwright.config.ts, eslint.config.js, index.html, public/**, scripts/**, src/main.tsx, src/vite-env.d.ts, src/app/App.tsx, src/app/router.tsx (+ test), src/styles/**, src/db/schema.ts, src/db/types.ts, src/db/defaults.ts, src/screens/{Live,Start,Welcome,History,SessionDetail,Compare,Settings}/index.tsx (placeholders only), src/test/**, e2e/fixtures.ts, e2e/helpers/**, e2e/shell.spec.ts, README.md (dev section only)
- Depends on: none
- Acceptance criteria:
  - [ ] package.json scripts: `dev` (vite), `build` (`tsc --noEmit && vite build && node scripts/check-size.mjs`), `preview` (`vite preview --port 4173 --strictPort`), `test` (`vitest run`), `test:coverage` (`vitest run --coverage`), `e2e` (`playwright test`), `lint` (`eslint .`), `typecheck` (`tsc --noEmit`). `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and `npm run e2e` all pass.
  - [ ] Every dependency later tasks need is installed now, so no later task edits package.json. Runtime: react@18, react-dom@18, zustand, dexie@4, dexie-react-hooks, d3-scale, d3-array, lucide-react, @fontsource/nunito, jspdf, svg2pdf.js, @tanstack/react-virtual, workbox-window. Dev: vite, @vitejs/plugin-react, typescript, vite-plugin-pwa, @vite-pwa/assets-generator, vitest, @vitest/coverage-v8, jsdom, fake-indexeddb, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom, @playwright/test, @axe-core/playwright, eslint, typescript-eslint, eslint-plugin-react-hooks, eslint-plugin-jsx-a11y, @types/react, @types/react-dom, @types/d3-scale, @types/d3-array, @types/node.
  - [ ] TypeScript `strict: true`. tsconfig covers src, e2e and config files. Vite `define: { __APP_VERSION__: JSON.stringify(pkg.version) }`, declared in src/vite-env.d.ts.
  - [ ] `src/styles/tokens.css` defines every token in the Global Constraints colour table under exactly those names (`--bg`, `--surface`, `--surface-2`, `--hairline`, `--text`, `--text-muted`, `--text-faint`, `--ink`, `--lavender`, `--peach`, `--mint`, `--butter`, `--sky`, `--rose`). It also defines tint tokens at 12 % alpha (`--tint-butter: rgba(241,224,170,0.12)`, plus `--tint-lavender`, `--tint-peach`, `--tint-mint`, `--tint-sky`), radii (`--radius-hero: 48px; --radius-card: 28px; --radius-button: 20px; --radius-icon: 18px; --radius-pill: 999px`), spacing (`--space-1: 4px` … `--gutter: 20px; --gap-card: 12px; --touch-min: 48px`), type sizes (`--fs-hero` 76–92 px clamp, `--fs-stat: 38px`, `--fs-stat-min: 32px`, `--fs-button: 26px`, `--fs-title: 22px`, `--fs-card-title: 18px`, `--fs-body: 15px`, `--fs-caption: 13px`) and motion (`--dur-crossfade: 220ms; --ease-out: cubic-bezier(0,0,.2,1); --glow-duration: 8s`). It has `[data-theme="day"]` overrides (`--bg #F7F4FB; --surface #FFFFFF; --surface-2 #EEE8F7; --text #2A2442; --text-muted #4F4868; --text-faint #625B7D; --hairline #DCD4EA`), a `@media (prefers-color-scheme: light)` block applied for `[data-theme="system"]`, and `@media (prefers-contrast: more) { --text-muted: #D6D0E8 }`.
  - [ ] `src/styles/global.css`: Nunito fallback stack `'Nunito', ui-rounded, 'SF Pro Rounded', system-ui, sans-serif`; `font-variant-numeric: tabular-nums` on body; `:focus-visible` ring 3 px `var(--lavender)` with 2 px offset and no ring on mouse focus; a `prefers-reduced-motion: reduce` rule that zeroes non-essential animations; safe-area padding via `env(safe-area-inset-top/bottom)`.
  - [ ] `src/styles/fonts.css`: own `@font-face` rules for Nunito 600/700/800/900 (latin) with `font-display: block`, pointing at `@fontsource/nunito/files/nunito-latin-{w}-normal.woff2` imported through Vite so they are bundled and hashed. index.html preloads the 900 and 700 woff2.
  - [ ] index.html has inline critical CSS `html{background-color:#1B1929}`, `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `apple-mobile-web-app-capable` (yes), `apple-mobile-web-app-status-bar-style` = `black-translucent`, `theme-color` #1B1929, and an apple-touch-icon link to a 180 px PNG.
  - [ ] Manifest via vite-plugin-pwa: name "Ebb — Contraction Timer", short_name "Ebb", display "standalone", orientation "any", background_color and theme_color "#1B1929", icons 192, 512 and 512 maskable (`purpose: "maskable"`). PNGs are committed in public/icons/ (icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon-180.png), generated once from public/icons/icon.svg (lowercase "ebb" mark in lavender on Dusk, text converted to paths) with @vite-pwa/assets-generator.
  - [ ] vite-plugin-pwa uses `strategies: 'generateSW'`, `registerType: 'prompt'`, `injectRegister: false`, and workbox `skipWaiting: false`, `clientsClaim: false`, `globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}']`, `maximumFileSizeToCacheInBytes` ≥ 5 MB (so the lazy PDF chunk is precached), `navigateFallback: 'index.html'`, and a same-origin CacheFirst runtime route. Registration is in src/main.tsx via `virtual:pwa-register` `registerSW({ immediate: true })`; Task 5 later takes over update handling.
  - [ ] `scripts/check-size.mjs` reads `dist/.vite/manifest.json` (enable `build.manifest: true`), walks the static `imports` graph from the `index.html` entry (not `dynamicImports`), gzips each JS file, prints the total, and exits 1 if it is over 120 × 1024 bytes.
  - [ ] `src/db/types.ts` exports exactly these (later tasks treat this file as frozen):
    ```ts
    export type EventType = 'waters'|'bleeding'|'reduced-movement'|'called-midwife'|'went-to-hospital'|'note';
    export type WatersDetail = 'clear'|'pink'|'green-brown'|'unsure';
    export type IntensityScale = 'words'|'numeric'|'both';
    export type Theme = 'night'|'day'|'system';
    export interface Session { id: string; name: string|null; startedAt: number; endedAt: number|null; notes: string; createdAt: number; updatedAt: number; thresholdMetAt: number|null }
    export interface Contraction { id: string; sessionId: string; startAt: number; endAt: number|null; intensity: number|null; note: string|null; deletedAt: number|null; timeChanged: boolean; reviewed: boolean; updatedAt: number }
    export interface EbbEvent { id: string; sessionId: string; at: number; type: EventType; details: WatersDetail|null; note: string|null; deletedAt: number|null; updatedAt: number }
    interface ThresholdBase { id: string; enabled: boolean; label: string|null; preset: boolean }
    export interface NInMThreshold extends ThresholdBase { kind: 'n-in-m'; n: number; minutes: number }
    export interface AldThreshold extends ThresholdBase { kind: 'ald'; apartMin: number; lastingMin: number; hours: number }
    export type Threshold = NInMThreshold | AldThreshold;
    export interface Settings { thresholds: Threshold[]; intensityScale: IntensityScale; theme: Theme; keepAwake: boolean; haptics: boolean; breathingGlow: boolean; lastBackupAt: number|null; onboardedAt: number|null }
    export type UndoKind = 'start'|'stop'|'rate'|'event'|'edit'|'delete'|'add';
    export type TableName = 'sessions'|'contractions'|'events';
    export interface UndoEntry { kind: UndoKind; at: number; before: Array<{ table: TableName; id: string; value: Session|Contraction|EbbEvent|null }> }
    ```
  - [ ] `src/db/defaults.ts` exports `PRESET_THRESHOLDS: Threshold[]` (ids `preset-3-in-10` n-in-m 3/10; `preset-5-1-1`, `preset-4-1-1`, `preset-3-1-1` ald with apartMin 5/4/3, lastingMin 1, hours 1; all `enabled: false, preset: true, label: null`) and `DEFAULT_SETTINGS: Settings` (thresholds = PRESET_THRESHOLDS, intensityScale 'words', theme 'night', keepAwake/haptics/breathingGlow true, lastBackupAt null, onboardedAt null).
  - [ ] `src/db/schema.ts`: `class EbbDB extends Dexie` named `ebb`, `version(1).stores({ sessions: 'id, startedAt, endedAt', contractions: 'id, sessionId, [sessionId+startAt]', events: 'id, [sessionId+at]', settings: '', undo: '' })`, with typed tables. Exports `createDb(deps?: { indexedDB: IDBFactory; IDBKeyRange: typeof IDBKeyRange }): EbbDB`, `getDb(): EbbDB` and `setDb(db: EbbDB): void`. A comment documents the migration rule (forward-only; snapshot to the backups cache first; Task 3 provides the snapshot function).
  - [ ] src/main.tsx opens `getDb()`, then sets `document.documentElement.dataset.dbReady = '1'` and renders `<App/>`. Later tasks must keep this attribute; e2e helpers wait for it.
  - [ ] `src/app/router.tsx` is a tiny hash router with no dependency: `export type RouteName = 'start'|'live'|'history'|'session'|'compare'|'settings'`; `useRoute(): { name: RouteName; params: { id?: string }; query: URLSearchParams; path: string }` (`''` and `'#/'` → start; unknown → start); `navigate(to: string, opts?: { replace?: boolean })` (to like `'#/session/abc'`); `<Link to className? ...>` rendering a real `<a href>`; `goBack(fallback: string)` (history.back() when an in-app entry exists, else navigate(fallback)). Unit tests cover parse and navigate.
  - [ ] `src/app/App.tsx` maps routes to placeholder screens: StartScreen, LiveScreen, HistoryScreen, `SessionDetailScreen({ id })`, `CompareScreen({ ids: string[] })`, SettingsScreen, plus an exported WelcomeScreen that is not routed yet. Each lives in `src/screens/<Name>/index.tsx` as a named export rendering an `<h1>` with the screen name.
  - [ ] Vitest: jsdom environment, `src/test/setup.ts` imports `fake-indexeddb/auto` and `@testing-library/jest-dom/vitest`, and replaces `globalThis.fetch` with a function that throws "Network access is forbidden in tests". `include: ['src/**/*.test.{ts,tsx}']`. Coverage config sets thresholds for `src/domain/**` of 100 % lines/functions/statements and 95 % branches.
  - [ ] `src/test/static/no-network.test.ts` scans `src/**/*.{ts,tsx}` (excluding tests) and fails on `fetch(`, `XMLHttpRequest`, `sendBeacon`, `new WebSocket`, `new EventSource`, or any `http://` / `https://` URL literal.
  - [ ] `src/test/static/no-raw-colours.test.ts` fails on any hex/rgb/hsl colour literal in `src/**/*.{css,ts,tsx}` outside `src/styles/tokens.css`. The only allowlisted path is `src/screens/SessionDetail/pdf/**` (the light-theme PDF).
  - [ ] `src/test/static/copy-rules.test.ts` fails if any `src/**` non-test file contains (case-insensitive) "active labour", "early labour", "Braxton Hicks", "false labour", "progressing well", "go to hospital", "call now", or "labour has stopped".
  - [ ] Playwright: `projects: [{ name: 'iphone-13', use: { ...devices['iPhone 13'] } }, { name: 'pixel-7', use: { ...devices['Pixel 7'] } }]` (WebKit and Chromium respectively); `webServer: { command: 'npm run build && npm run preview', port: 4173, reuseExistingServer: !process.env.CI }`; `baseURL: 'http://localhost:4173'`; `testDir: 'e2e'`.
  - [ ] `e2e/fixtures.ts` exports `test` and `expect`. `test` extends the base with an auto fixture that records every `page.on('request')` and fails the test if any URL's origin differs from baseURL's origin (ignoring `data:`/`blob:`). Every spec in the repo imports from here.
  - [ ] `e2e/helpers/db.ts` exports `waitForDb(page)` (waits for `html[data-db-ready="1"]`); `seedDb(page, data: { sessions?, contractions?, events?, settings? })` (raw IndexedDB in `page.evaluate`, opens `ebb` without a version, puts rows, settings under key `'singleton'`, then reloads); `readDb(page)`; `clearDb(page)`; `onboard(page, overrides?)` (writes DEFAULT_SETTINGS with `onboardedAt` set). Factories `makeSession(p)`, `makeContraction(p)`, `makeEvent(p)` fill every field with defaults, and `buildSeries({ sessionId, startAt, count, intervalMs, durationMs, intensity? })` returns contractions. It has a short README comment on using `page.clock.install({ time })` before `goto` for time control.
  - [ ] `e2e/shell.spec.ts`: the first paint has computed `html` background `rgb(27, 25, 41)`; the manifest link resolves with the required fields; the service worker registers; after the first load, `context.setOffline(true)` plus a reload still renders the app shell `<h1>`; no foreign-origin requests.
- Validation: `npm install && npx playwright install chromium webkit && npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
- Notes for implementer:
  - Spec text: docs/implementation-spec.txt (Design tokens, PWA, Stack sections). Palette sheet: docs/screens/09-palette-type-shapes.png.
  - Dexie stores `null` fine. Null is not a valid IndexedDB key, so `endedAt: null` rows are not in the `endedAt` index. Task 3 handles that; just keep the index as the spec says.
  - Dexie version 1 corresponds to native IDB version 10. The seed helper must open without a version so it never triggers an upgrade.
  - The placeholder screens are replaced wholesale by later tasks; keep them trivial.
  - Do not add react-router; the hash router must stay tiny for the 120 kB budget.
  - eslint flat config: typescript-eslint recommended-type-checked (or recommended), react-hooks, jsx-a11y recommended; ignore dist, dev-dist, coverage, playwright-report.

### Task 2: Domain library (pure metrics, formatting, naming, thresholds, summary, CSV)
- Type: code
- Goal: Implement every derived number and string as pure, memoisable, fully unit-tested functions under src/domain/.
- Owns: src/domain/**
- Depends on: Task 1
- Acceptance criteria:
  - [ ] No DOM, no Dexie, no React imports in src/domain. It may import types from `src/db/types.ts` and d3-array. `npm run test:coverage` reports 100 % lines/functions/statements and ≥ 95 % branches for src/domain/**.
  - [ ] `src/domain/metrics.ts` exports and tests:
    - `VERY_SHORT_MS = 5000`; `GAP_MIN_MS = 15 * 60_000`.
    - `interface CPoint { id: string; startAt: number; endAt: number; intensity: number|null }`.
    - `countedContractions(cs: Contraction[]): CPoint[]`: finished (`endAt != null`), `deletedAt == null`, sorted by startAt, excluding rows where `(endAt − startAt < VERY_SHORT_MS || timeChanged) && !reviewed`.
    - `allStarts(cs: Contraction[]): number[]`: startAt of every non-deleted contraction, including in-progress.
    - `interface Row { c: CPoint; duration: number; interval: number|null; rest: number|null; isGap: boolean }`; `deriveRows(points: CPoint[]): Row[]`, using the spec formulas for duration, interval and rest. `isGap` means interval > 2.5 × median(previous up to 5 intervals) AND ≥ 15 min, and needs at least 3 previous intervals.
    - `lastStats(points): { interval: number|null; duration: number|null }`.
    - `rollingAverages(points, now, windowMin: 30|60): { interval: number|null; duration: number|null; intervalCount: number }`. This is the mean of intervals whose start falls in [now − window, now) and the mean of durations of contractions starting in the window. Both are null when there are fewer than 2 intervals in the window.
    - `per10Min(starts: number[], now): number`: count in [now − 10 min, now).
    - `tenMinuteBuckets(starts, sessionStart, end): { start: number; count: number }[]`: fixed buckets from sessionStart.
    - `regularity(points, now): { label: 'Regular'|'Fairly regular'|'Irregular'; cv: number; rangeMin: [number, number] } | null`. Uses non-gap intervals in the last 60 min and needs ≥ 4. CV < 0.20 Regular; 0.20–0.40 Fairly regular; > 0.40 Irregular. rangeMin is the 10th/90th percentiles (d3 `quantile`) in minutes, rounded to whole minutes.
    - `progression(points, now): { interval: 'getting closer together'|'getting further apart'|'steady'|null; duration: 'getting longer'|'getting shorter'|'steady'|null; intensity: 'getting stronger'|'easing off'|'steady'|null }`. Uses least-squares slope against start time over the last 60 min, excluding gaps, with ≥ 5 points per metric (intensity uses rated points only), else null. Thresholds: interval ±0.5 min/h; duration ±5 s/h; intensity ±0.5/h.
    - `leastSquaresSlope(points: { x: number; y: number }[]): number`; `rollingMean(values: number[], k: number): (number|null)[]`.
    - `summarizeWindow(cs: Contraction[], from: number, to: number): { count: number; avgInterval: number|null; avgDuration: number|null; avgIntensity: number|null; unrated: number }`. count uses all non-deleted starts in the window; averages use countedContractions; avgIntensity ignores nulls; unrated counts finished counted rows with intensity null.
    - `findOverlap(cs: Contraction[], cand: { startAt: number; endAt: number }, excludeId?: string): Contraction|null`: non-deleted finished contractions only.
    - `computeLiveMetrics(cs, now)` (last stats, rolling 30/60, regularity, progression, per10, last-hour points) and `computeSessionMetrics(cs, events, range: { from: number; to: number })` (rows, summary, regularity, progression, buckets, trend series with rollingMean k = 3 when there are ≥ 4 points, else no line). Each has a `createMemo()` variant keyed on array identity plus a `now` rounded to 1 s.
  - [ ] Performance test: `computeSessionMetrics` on a generated 24 h session with 320 contractions plus 20 events takes < 16 ms (median of 5 runs).
  - [ ] `src/domain/format.ts` exports and tests:
    - `formatDuration(ms)`: "58s" (< 60 s); "4m 10s", "5m 05s", "4m" (< 60 min; seconds zero-padded; zero seconds dropped); "1 h 15 m", "2 h" (≥ 60 min).
    - `formatTimer(ms)`: "0:00", "0:48", "3:42", "1:02:05".
    - `formatClock(epoch)`: "23:44" (24-hour, local).
    - `formatDateShort(epoch)`: "Sun 25 Oct".
    - `formatTimeRange(start, end|null)`: "19:05–23:40" or "21:40 – now".
    - `formatSessionLength(ms)`: "40 m", "2 h 19 m".
    - `formatSpoken(ms)`: "3 minutes 42 seconds", "58 seconds", "1 hour 2 minutes".
    - `formatRelativeDays(then: number|null, now)`: "today" | "yesterday" | "5 days ago" | "never".
    - `formatSummaryMinutes(ms)`: "4.5 min", "5 min".
    - `formatSummarySeconds(ms)`: "55 s".
    - `formatIntensity(value: number|null, scale)`: words → "Strong"; numeric → "6"; both → "Strong · 6"; null → "—". Non-even values map to the nearest word, with ties going up.
    - `formatRegularityRange([lo, hi])`: "every 4–6 min" or "every 5 min".
  - [ ] Local-time tests run with `process.env.TZ = 'Europe/London'`, including the daylight-saving end on 25 Oct 2026 (01:00–02:00 repeats). A session spanning it reports correct durations from epoch maths.
  - [ ] `src/domain/intensity.ts`: `WORD_SCALE = [{ word: 'Mild', value: 2 }, { word: 'Medium', value: 4 }, { word: 'Strong', value: 6 }, { word: 'Very strong', value: 8 }, { word: 'Intense', value: 10 }]`; `toWord(value)`.
  - [ ] `src/domain/naming.ts`: `partOfDay(epoch)` (morning 05:00–11:59, afternoon 12:00–16:59, evening 17:00–20:59, night 21:00–04:59); `defaultSessionName(startedAt)` → "{Weekday} {part}", using the **start** day (Sat 23:30 → "Saturday night"; Sun 02:10 → "Sunday night"); `displayName(session, now)`: the name if set; else, if active, "Tonight" (evening/night), "This morning" or "This afternoon"; else defaultSessionName.
  - [ ] `src/domain/events.ts`: labels `waters` "Waters broke", `bleeding` "Bleeding", `reduced-movement` "Reduced baby movement", `called-midwife` "Called midwife", `went-to-hospital` "Went to hospital", `note` "Note"; waters options `clear` "Clear", `pink` "Pink", `green-brown` "Green or brown", `unsure` "Not sure" (lower-case in sentences: "clear", "pink", "green or brown", "not sure"); timeline letters W, B, R, M, H, N and T (threshold met); `needsGentlePrompt(type, details)` is true for bleeding, reduced-movement, and waters with green-brown; `GENTLE_PROMPT = "If you haven't already, contact your midwife or maternity unit."`; `eventConfirmation(e)` → "Saved · Waters broke, green or brown, 23:30"; `eventSentence(e)` → "Waters broke 23:30, clear." / "Called midwife 23:36." / "Note 23:10: had a bath.".
  - [ ] `src/domain/thresholds.ts`: `thresholdName(t)` (label if set; else "3 in 10 min" style for n-in-m; "5-1-1" style for ald); `thresholdDescription(t)` ("Three contractions within ten minutes" for 3/10, "5 min apart, 1 min long, for 1 hour" for ald); `evaluateThreshold(t, cs, now): boolean`, following the spec rules (N in M on all non-deleted starts; A-L-D with ±5 s tolerance on both interval and duration, ≥ (D×60/A) − 1 contractions in the window, and no gap); `firstMet(thresholds, cs, now): Threshold|null` (enabled only, list order); `bannerText(t)` → "Matches the threshold you set — {name}"; `validateCustom(input)` returning field errors (all positive; n 1–20; minutes 1–120; apartMin 1–30; lastingMin 0.5–5; hours 0.5–6). Tests cover met, not met, boundary ±5 s, a gap breaking A-L-D, and the order of several met thresholds.
  - [ ] `src/domain/summary.ts`: `summaryText({ contractions, events, now, scope: 'last-hour'|'whole', sessionStart, sessionEnd })` returns exactly "Last hour: 12 contractions, every 4.5 min, lasting about 55 s, strength about 6/10. Waters broke 23:30, clear." for the spec example fixture. Prefix "Whole session:" for scope whole; the strength clause is omitted when there are no ratings; with < 2 intervals the interval clause is omitted.
  - [ ] `src/domain/csv.ts`: `toCsv(contractions, events): string`. Header exactly `type,start,end,duration_s,interval_s,intensity,note`; rows chronological; contraction rows `type=contraction`; event rows `type=<event type>`, `start=at`, end/duration/interval empty, note = details and note joined with "; ". Timestamps are ISO 8601 local with offset (e.g. `2026-10-25T23:31:05+00:00`). Fields are RFC 4180 quoted when needed. Deleted rows are excluded.
  - [ ] Edge-case tests in this task: contraction under 5 s is excluded from averages until reviewed; rating skipped means averages ignore it and `unrated` counts it; only 1–3 contractions gives null stats, null regularity and no trend lines; session past midnight keeps the default name on the start day; a clock moved back (timeChanged) is excluded until reviewed.
- Validation: `npm run test:coverage && npm run lint && npm run typecheck`
- Notes for implementer:
  - Spec: docs/implementation-spec.txt "Derived metrics", "Threshold evaluation", "Copy rules", SH-01, SH-03. Screenshots docs/screens/01, 05, 06 show real formatted strings.
  - Times are epoch ms. Use `Date`/`Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })` for local display.
  - Several screen tasks consume these exact names and signatures; don't rename them. Add helpers freely.

### Task 3: Database repositories, write queue, undo, multi-tab sync, backup I/O and the Zustand store
- Type: code
- Goal: Provide the only write path to IndexedDB, with persist-before-render, invariants, undo, soft delete and purge, storage-failure handling, an in-memory fallback, cross-tab sync, backup export/import/delete-all, and reactive hooks for screens.
- Owns: src/db/** except src/db/types.ts, src/db/defaults.ts and src/db/schema.ts (frozen; schema.ts may only gain a migration snapshot hook comment); src/state/**; src/main.tsx
- Depends on: Task 1
- Acceptance criteria:
  - [ ] All writes go through `src/db/queue.ts` `runWrite<T>(op: () => Promise<T>, overlay?: OverlayRecord[]): Promise<T>`. It is a single in-tab promise chain, so writes are serialised. Each op runs in a Dexie `rw` transaction. A failure is retried 3× (100, 300, 900 ms). After the last failure, status becomes `'failing'`, the op and its overlay records are kept in memory, and the call resolves with the intended result, so the UI keeps the tap.
  - [ ] `retryPendingWrites(): Promise<boolean>` replays pending ops in order. Status returns to `'ok'` and the overlay clears on success. Unit test: a stubbed failing table → 3 retries → status `failing` → hooks still return the overlaid record → after recovery, Retry commits it.
  - [ ] Storage status lives in the store: `'ok'|'failing'|'memory'`, plus `pendingCount`. If `getDb().open()` fails at init (private mode / storage unavailable), `initStore()` lazily imports `fake-indexeddb`, calls `setDb(createDb({ indexedDB, IDBKeyRange }))` and sets status `'memory'`. It still sets `html[data-db-ready="1"]`. Unit test included.
  - [ ] Repositories (`src/db/sessions.ts`, `src/db/contractions.ts`, `src/db/events.ts`, `src/db/settings.ts`, `src/db/undo.ts`) export exactly:
    - `startSession(now = Date.now()): Promise<Session>`: throws if a session is active; clears undo.
    - `endSession(id, now?)`: sets endedAt; if a contraction is in progress, its endAt = now; clears undo.
    - `renameSession(id, name: string|null)`; `setSessionNotes(id, notes)`; `markThresholdMet(id, at)` (only if thresholdMetAt is null).
    - `startContraction(sessionId, now?)`: throws if a contraction is open or the session is not active. Sets `timeChanged: true` if now < the startAt of the latest existing contraction in the session. Undo kind `start` (before = null).
    - `stopContraction(id, now?)`: undo kind `stop` (before = open row).
    - `discardContraction(id)`: hard delete; clears undo.
    - `rateContraction(id, intensity: number|null)`: undo `rate`.
    - `updateContraction(id, patch: { startAt?, endAt?, intensity?, note? })`: rejects with `OverlapError { other: Contraction }` if it overlaps, and with `RangeError` if endAt ≤ startAt; sets `reviewed: true` and clears `timeChanged`; undo `edit`.
    - `addMissedContraction(sessionId, { startAt, durationMs, intensity?, note? })`: overlap check; `reviewed: true`; undo `add`.
    - `deleteContraction(id)`: soft; undo `delete`.
    - `addEvent(sessionId, { type, at, details?, note? })`: undo `event`; `updateEvent(id, patch)`: undo `edit`; `deleteEvent(id)`: soft; undo `delete`.
    - `getSettings()` (writes DEFAULT_SETTINGS if missing); `updateSettings(patch: Partial<Settings>)` (no undo).
    - `undoLast(): Promise<UndoKind|null>`: restores each `before` value (null → delete row) in one transaction, then clears the slot.
    - `purgeExpired(now)`: hard-deletes soft-deleted contractions/events whose session `endedAt + 24 h ≤ now`.
    - Every mutating op sets `updatedAt` and writes its undo entry in the same transaction. IDs come from `crypto.randomUUID()`.
  - [ ] Invariant tests: a second `startSession` while one is active throws; a second open contraction throws; a contraction can only open in the active session; undo for start/stop/rate/event/edit/delete/add each round-trip; depth is 1 (the second action replaces the first); endSession clears undo.
  - [ ] `src/db/sync.ts`: a BroadcastChannel `'ebb-sync'` posts `{ type: 'changed', tables }` after every committed write. Receivers trigger a refresh of live queries (e.g. `Dexie.on('storagemutated').fire(...)`) and of the store. The last write wins per record. Unit test with two channel instances.
  - [ ] `src/db/backup.ts`:
    - `buildBackup(now): Backup`: `{ app: 'ebb', schema: 1, exportedAt, sessions, contractions, events, settings }`, excluding soft-deleted rows.
    - `exportBackup(now): Promise<{ blob: Blob; filename: string }>`: filename `ebb-backup-YYYY-MM-DD.json`; sets `settings.lastBackupAt = now`.
    - `parseBackup(text): { ok: true; backup: Backup; counts: { sessions; contractions; events } } | { ok: false; error: "This file isn't an Ebb backup" }`. It validates app, `schema === 1`, arrays, that every id is a non-empty string, that every contraction/event sessionId exists, and the field types.
    - `restoreBackup(backup, mode: 'merge'|'replace'): Promise<{ added: number; skipped: number }>`. Merge works by id; on conflict the newer `updatedAt` wins (counted as added), else skipped. Imported active sessions are closed at their latest timestamp; imported open contractions are dropped (skipped). Merge keeps device settings; Replace first calls `snapshotToBackupsCache('before-replace')`, clears the data stores and takes the backup's settings, keeping the device's onboardedAt. It throws if a session is active.
    - `snapshotToBackupsCache(reason): Promise<void>` stores the JSON in Cache Storage `'ebb-backups'` under `/backups/{iso}-{reason}.json`, falling back to a no-op when `caches` is missing.
    - `deleteAllData(): Promise<void>` clears all five stores and deletes the `'ebb-backups'` cache only (never the Workbox precache).
  - [ ] Backup tests: round-trip; merge overlap with conflict counts; corrupt JSON, wrong app and `schema: 2` each give the exact error and change nothing (DB unchanged); Replace snapshots first.
  - [ ] `src/state/store.ts` (Zustand) and `src/state/hooks.ts`:
    - `initStore(): Promise<void>`: opens the DB with fallback, subscribes liveQueries, sets dbReady.
    - `useAppStore` with `{ ready: boolean; activeSession: Session|null; activeContraction: Contraction|null; settings: Settings; storage: { status: 'ok'|'failing'|'memory'; pendingCount: number }; undo: UndoEntry|null }`.
    - Hooks: `useSessions(): Session[]|undefined` (newest first), `useSession(id)`, `useContractions(sessionId): Contraction[]|undefined` (non-deleted, by startAt, with overlay merged), `useEvents(sessionId)`, `useSettings()`, `useUndoAvailable(): boolean`, `useStorageStatus()`.
    - The active session is found by filtering sessions with `endedAt === null`; the `endedAt` index does not include nulls.
  - [ ] Persist-before-render: a test asserts the store's `activeContraction` changes only after `startContraction`'s transaction resolves. A benchmark test shows `startContraction` + `stopContraction` p95 < 50 ms over 100 runs on fake-indexeddb.
  - [ ] src/main.tsx calls `initStore()` before rendering (replacing the bare `getDb().open()`), keeps the `data-db-ready` attribute and keeps SW registration.
- Validation: `npm test && npm run lint && npm run typecheck && npm run build && npm run e2e`
- Notes for implementer:
  - Spec: docs/implementation-spec.txt "Data model", "Closing, locking and backgrounding", "Edge cases" (storage full, private browsing, two tabs, restore overlap, corrupt backup, delete all), SH-04. Design answers: shared depth-1 undo slot for Live and Session detail; snapshot before Replace; Restore disabled during an active session.
  - Do not edit src/db/types.ts, defaults.ts or schema.ts. Task 2 is building against them in parallel.
  - Use `dexie-react-hooks` `useLiveQuery` inside the hooks. Keep the Zustand store as a cache that liveQuery subscriptions populate.
  - Overlay merging: the hooks return DB rows with pending overlay records replacing or adding by id.
  - `findOverlap` will exist in src/domain/metrics.ts (Task 2, built in parallel). Implement a local private overlap check here to avoid a cross-task dependency, using the same rule: two finished non-deleted contractions overlap if `a.startAt < b.endAt && b.startAt < a.endAt`.

### Task 4: UI kit (shared components, chart primitives and small hooks)
- Type: code
- Goal: Build the presentational components and SVG charts every screen composes, so screen tasks can run in parallel.
- Owns: src/components/**, src/charts/**, src/lib/**
- Depends on: Task 1
- Acceptance criteria:
  - [ ] Every component uses CSS Modules and tokens only (the static colour test from Task 1 passes), works with a keyboard, has a test in Vitest + Testing Library, and passes `axe` via `vitest-axe`-style checks using `@axe-core` already installed (or Testing Library role queries where axe can't run in jsdom).
  - [ ] `src/lib/useNow.ts`: `useNow(): number` ticks with requestAnimationFrame but sets state at most once per second, on the whole-second boundary of Date.now(). It pauses when `document.hidden` and recomputes immediately on visibilitychange. Test with fake timers.
  - [ ] `src/lib/useReducedMotion.ts`: `useReducedMotion(): boolean` (matchMedia).
  - [ ] `src/lib/share.ts`: `saveFile(blob, filename): Promise<'downloaded'|'shared'>` uses an anchor `download`, or `navigator.share({ files })` when `navigator.canShare?.({ files })` and the display-mode is standalone on iOS. `copyText(text): Promise<boolean>`.
  - [ ] `src/components/` exports (one folder each, `index.ts` barrel at src/components/index.ts):
    - `Card`, `IconButton({ label, icon, onClick })` (48×48, radius 18), `Button({ variant: 'primary'|'secondary'|'ghost'|'destructive-text', ... })` (primary = lavender fill, ink text; destructive-text = `--rose` text, never a fill), `Pill({ tone: 'mint'|'faint'|'peach'|'neutral', icon?, children })`.
    - `HeroButton({ tone: 'lavender'|'peach', shape: 'rounded'|'circle', onPress, ariaLabel, glow?: boolean, dimmed?: boolean, children })`: a real `<button>`. Rounded: radius 48, fills flex space, min-height 240 px. Circle: 300 px diameter, radius 50 %. Two halo rings at 10 % / 10 px and 5 % / 22 px in its own colour. 200–250 ms ease-out colour crossfade. Glow: a CSS-only 8 s ease-in-out scale 0.94→1.04, opacity 0.35→0.90, rendered only when `glow && !reducedMotion`, with `animation-play-state: paused` when the document is hidden. No shadows or gradients.
    - `StatCard({ label, value, caption?, dimmed? })`: the value never wraps (`white-space: nowrap`); it shrinks from `--fs-stat` to 32 px minimum to fit (ResizeObserver or a CSS container query); `dimmed` sets opacity 0.55.
    - `StrengthPicker({ scale: 'words'|'numeric'|'both', title?: string, durationLabel: string, onChoose(v: number), onSkip(), onAutoClose(), autoCloseMs = 30000 })`: a `role="radiogroup"`. Words = five options Mild…Intense, shown as growing peach dots plus words (values 2/4/6/8/10); numeric = a 1–10 row; both = both rows. A thin progress bar shows the remaining time. The timer pauses while focus is inside. Caption "Closes by itself — you can rate it later"; "Skip" button; header "How strong was that one?" with durationLabel. Layout per docs/screens/03-live-rate-it.png.
    - `Sheet({ open, onClose, title, children })`: a bottom sheet, `role="dialog"`, `aria-modal`, labelled by its title, focus trapped and restored, Esc and scrim close it. It slides in, fading only under reduced motion.
    - Toasts: `src/components/Toast/toastStore.ts` (Zustand) `showToast({ message, actionLabel?, onAction?, durationMs })`; `<ToastHost/>` renders the current toast in a `role="status"` region (one at a time, newest replaces).
    - `Switch({ checked, onChange, label, description?, tone: 'mint'|'butter' })`: `role="switch"`, `aria-checked`; the whole row is a ≥ 48 px target.
    - `Segmented({ label, options: { value, label }[], value, onChange })`: radiogroup semantics, arrow-key navigation; the selected option is a lavender fill with ink text (docs/screens/08-settings.png).
    - `HoldToConfirm({ label, durationMs = 1500, onConfirm })`: pointer hold fills a ring under the finger; releasing early cancels. Holding Space or Enter for the duration also confirms. A `click` event with `detail === 0` (AT/keyboard activation without hold) calls `onConfirm` immediately. Under reduced motion there is no fill animation and the text counts down "Keep holding · 1.5 s" → "1.0 s" → "0.5 s".
    - `TimeField({ label, value: number, reference: number, onChange(epoch), min?, max? })`: `<input type="time">` resolved to the occurrence nearest `reference` within ±12 h, so it works across midnight. `DurationField({ label, valueMs, onChange })` has minutes and seconds inputs.
    - `SummarySheet({ open, onClose, text })`: a Sheet titled "Share summary" showing the paragraph, a "Copy" button (copyText → toast "Copied") and "Share…" (`navigator.share({ text })`, hidden when unsupported).
    - `SafetyLine()` renders verbatim "This app records contractions. It doesn't give medical advice — if you're worried, contact your midwife or maternity unit." `Skeleton()` renders card outlines plus a big `--surface-2` button, with no text and no spinner.
  - [ ] `src/charts/` exports (all SVG, d3-scale only, colours via `var(--token)`, `role="img"` with an `aria-label` summary prop, tooltips for pointer and keyboard):
    - `Sparkline({ items: { startAt: number; endAt: number }[], domain: [number, number], tone: 'lavender'|'sky'|'faint', height? })`.
    - `Timeline({ items: { id, startAt, endAt, intensity: number|null, flag?: 'very-short'|'time-changed' }[], markers: { id, at, letter, label, kind: 'event'|'threshold' }[], gaps: { from, to }[], domain: [number, number], now?: number, variant: 'mini'|'full'|'compare', series?: 'primary'|'secondary'|'tertiary', summary: string, onSelect?(id) })`. Bar x = start, width = duration (min 5 px), height = intensity scaled 1–10 (unrated = middle height, hollow outline). Event markers are circles (mini: ring; full: lettered circle) plus legend text. A dotted vertical line marks `now`. Gaps are dashed empty boxes. The x-axis shows HH:mm and also labels the date ("Mon 26 Oct") when the domain crosses local midnight. Compare series styles: primary = solid lavender fill; secondary = sky dashed outline, no fill; tertiary = `--text-muted` dotted outline.
    - `TrendChart({ series: { id, points: { t, v, refId? }[], line?: { t, v }[] | null, style: 'solid'|'dashed'|'dotted', tone: 'lavender'|'peach'|'butter'|'sky'|'muted' }[], domain, yUnit, yTicks?, summary, onSelect?(refId) })`: dots per point plus an optional line.
    - `FrequencyBars({ buckets: { start, count }[], domain, summary })`: sky bars with count labels.
    - `useZoomPan({ fullDomain, domain, onChange })`: pinch (two pointers) zooms the time axis; one-pointer drag pans; double-tap resets to fullDomain. Clamped to fullDomain; pointer-events only, with no gesture library. It updates through rAF.
    - `ChartTooltip({ title, lines: string[], onEdit? })` with an "Edit" link.
  - [ ] A Vitest render test for Timeline with 320 items finishes the initial render in < 50 ms in jsdom. The Timeline avoids per-frame React re-renders during pan (it transforms a `<g>` and commits the domain on gesture end or at rAF cadence).
  - [ ] Tests cover: StrengthPicker auto-close at 30 s, pause on focus, Skip, choice values per scale; HoldToConfirm early release cancels, 1.5 s confirms, `detail === 0` click confirms, Space hold confirms, reduced-motion text; Switch and Segmented roles and aria states; Sheet focus trap and Esc; Timeline geometry (min 5 px, hollow unrated, dashed gap, midnight date label); StatCard nowrap.
- Validation: `npm test && npm run lint && npm run typecheck && npm run build`
- Notes for implementer:
  - Layout and visual reference: docs/screens/01–09. Tokens are already in src/styles/tokens.css (Task 1); use CSS vars only, because the static test fails on literal colours.
  - Keep the bundle lean (budget 120 kB gzip total). Import lucide icons individually (`import { Undo2 } from 'lucide-react'`); strokeWidth 2–2.4.
  - The components are presentational: no Dexie or store imports, except toastStore and the lib hooks.

### Task 5: App lifecycle, landing rules, Welcome and Start
- Type: code
- Goal: Make the app land on the right screen on every open, handle themes, SW updates, persistence, install hints and storage warnings, and build the Welcome and Start screens.
- Owns: src/app/** (except src/app/wakeLock.ts, owned by Task 6), src/main.tsx, src/screens/Start/**, src/screens/Welcome/**, e2e/landing.spec.ts, e2e/welcome.spec.ts, e2e/start.spec.ts
- Depends on: Task 2, Task 3, Task 4
- Acceptance criteria:
  - [ ] `src/app/landing.ts`: `decideLanding({ onboardedAt, activeSession, activeContraction }): 'welcome'|'live'|'start'`, unit-tested for all four rules (no onboardedAt → Welcome; open contraction → Live contracting; open session → Live resting; otherwise → Start).
  - [ ] Route guard in App.tsx: Welcome renders (at `#/`) whenever onboardedAt is null. `#/` redirects (replace) to `#/live` while a session is active. `#/live` redirects to `#/` when no session is active. Other routes are untouched. `<ToastHost/>` is mounted once.
  - [ ] Skeleton: if `initStore()` hasn't resolved within 300 ms, render `<Skeleton/>` (card outlines plus a big `--surface-2` button, no text, no spinner). There is never a blank frame. Unit test with a delayed store.
  - [ ] On launch, after the store is ready, call `purgeExpired(Date.now())`.
  - [ ] `src/app/theme.ts` applies `document.documentElement.dataset.theme` from `settings.theme` (night/day/system) reactively. Test included.
  - [ ] `src/app/swUpdate.ts` exports `useUpdateReady(): boolean`, wrapping `registerSW` from `virtual:pwa-register` with `onNeedRefresh`. It never calls `updateSW(true)` while a session is active. On a cold start, if a worker is waiting and no session is active, it calls `updateSW(true)`. Unit test with the virtual module mocked.
  - [ ] `src/app/installPrompt.ts` captures `beforeinstallprompt` early and exports `useInstallHint(): { kind: 'none'|'ios'|'prompt'; prompt?: () => Promise<void> }`. The kind is 'none' when standalone (`matchMedia('(display-mode: standalone)')` or `navigator.standalone`).
  - [ ] Welcome (one screen, not a carousel): the "ebb" lowercase wordmark (Nunito 900, lavender); the line "Time contractions with one tap. Everything stays on this phone."; the safety line verbatim (SafetyLine); the install hint only when not standalone (iOS: "Tap Share, then Add to Home Screen."; Chromium: an "Install" button calling the deferred prompt); the primary button "Get started", which calls `navigator.storage?.persist?.()`, sets `onboardedAt` via `updateSettings` and navigates to `#/`. No threshold questions.
  - [ ] Storage-unavailable notice: when storage status is `'memory'`, Welcome and Start show a quiet card "This browser won't keep your data. Open Ebb from your home screen instead." E2E: an init script makes `indexedDB.open` throw → the card shows, and Start timing still works (the Live placeholder or screen loads).
  - [ ] Start screen (docs/screens/04-start.png):
    - Header: "ebb" wordmark with an icon button (sliders icon, label "Settings") → `#/settings`.
    - ST-01 "Whenever you're ready." sits above a lavender hero Start timing button that creates a session and opens Live. The subline is "One tap when a contraction starts, one when it eases. That's all." The hero has a play icon in a circle, "Start timing" and "Begins a new session"; it calls `startSession()` then `navigate('#/live')`.
    - ST-02 The last-session card shows name, date, time range, length, count and a sparkline, and opens Session detail. It is hidden when there is no history. It shows the most recent ended session: "LAST SESSION", the display name, "Tue 20 Oct · 19:05–23:40 · 4 h 35 m · 31 contractions", a sky Sparkline and a chevron, and links to `#/session/:id`.
    - ST-03 All sessions opens History. The backup button shows the relative time since the last backup ("never" in --butter if none and data exists). "All sessions" → `#/history`. "Back up · {today|yesterday|N days ago|never}" runs `exportBackup` + `saveFile`, then shows "Back up · today".
    - ST-04 The safety line is always visible at the bottom.
  - [ ] Edge case "persist() denied": silent. When `navigator.storage.persisted()` resolves false and there are ≥ 3 sessions, the backup button renders in the more prominent butter tint panel style. Unit test.
  - [ ] E2E (both projects): first launch → Welcome with the safety line → Get started → Start. With a seeded onboarded, ended session the Start card shows its details and opens `#/session/:id`. Seeded active session → opening `#/` lands on `#/live`. Seeded open contraction → lands on `#/live`. No sessions → the last-session card is hidden. With a delayed DB read (init script wrapping `indexedDB.open` with a 600 ms delay) the skeleton is visible, and the page is never blank (body background is never white).
- Validation: `npm test && npm run lint && npm run typecheck && npm run build && npm run e2e`
- Notes for implementer:
  - Spec: docs/implementation-spec.txt "App lifecycle" (landing, Welcome, Updates), ST-01..04, "persist() denied" edge row. Diagram: docs/screens/10-landing-rules.png.
  - Store API (Task 3): `initStore()`, `useAppStore` (`ready`, `activeSession`, `activeContraction`, `settings`, `storage.status`), `useSessions()`, `useContractions(id)`, `startSession()`, `updateSettings(patch)`, `purgeExpired(now)`, `exportBackup(now)`.
  - Domain (Task 2): `displayName`, `formatDateShort`, `formatTimeRange`, `formatSessionLength`, `formatRelativeDays`. UI kit (Task 4): `HeroButton`, `Card`, `IconButton`, `Button`, `Sparkline`, `SafetyLine`, `Skeleton`, `ToastHost`, `saveFile`. Router (Task 1): `useRoute`, `navigate`, `Link`.
  - Keep the `data-db-ready` attribute logic in main.tsx (e2e helpers rely on it).
  - Test helpers: `e2e/fixtures.ts` (`test`, `expect`), `e2e/helpers/db.ts` (`onboard`, `seedDb`, `makeSession`, `buildSeries`).

### Task 6: Live tracker core (hero toggle, timers, stats, pattern, mini timeline, banner, wake lock, haptics, resume, stale and paused cards)
- Type: code
- Goal: Build the Live screen's tracking loop and information display, persisting every tap before the UI changes.
- Owns: src/screens/Live/** (initial creation), src/app/wakeLock.ts (+ test), e2e/live-core.spec.ts, e2e/live-edge.spec.ts
- Depends on: Task 2, Task 3, Task 4
- Acceptance criteria:
  - [ ] Layout per docs/screens/01-live-resting.png (resting) and 02-live-contracting.png (contracting), top to bottom: header (session display name as a link to `#/session/:id`, "Started 21:40 · 2 h 14 m so far", wake-lock pill, menu icon button), threshold banner slot, two stat cards, averages card, pattern line, hero button (flex: 1), mini timeline (links to detail), action-row slot, end-session slot. Task 8 fills the slots; export `LiveLayout` slots or render props so Task 8 can drop components in without restructuring. The hero has `data-state="resting|contracting"` for tests.
  - [ ] LT-01 "Tapping anywhere on the hero button toggles resting ↔ contracting. A tap commits to IndexedDB before the UI changes, and the UI responds within 100 ms." It calls `startContraction`/`stopContraction` and updates on resolution. E2E measures pointer-up → `data-state` change in-page < 100 ms (median of 5), and `readDb` shows the row right after.
  - [ ] LT-02 "Resting: lavender, labelled "Tap when it starts", with a big timer for time since the last start (or "No contractions yet" with no timer)." The caption under the timer is "since the last one started".
  - [ ] LT-03 "Contracting: a 300 px peach circle labelled "Contraction" above and "Tap when it eases" below, with an elapsed m:ss timer. The header and stat cards drop to 55 % opacity." In contracting, the averages card, pattern line, mini timeline and end slot are hidden. The breathing caption "Breathe with the glow — in as it grows, out as it fades" shows only when Breathing glow is on and reduced motion is off. The glow follows the same rule.
  - [ ] LT-04 "Taps within 600 ms of the previous toggle are ignored (debounce) to absorb double taps." E2E with page.clock: a double tap creates one contraction.
  - [ ] LT-05 "The stat cards show the last interval ("Time apart") and last duration ("Lasting"), or — when unknown. Values never wrap; they shrink to 32 px if needed." The caption is "last one".
  - [ ] LT-06 "The averages card shows the last 30 and 60 min as "every {interval} · {duration} long", or "Not enough yet"." The row labels are "Last 30 min" / "Last hour".
  - [ ] LT-07 "The pattern line shows regularity · progression in plain words, with a mint dot for Regular, butter for Fairly regular and faint for Irregular. It is hidden when there's too little data." For example "Fairly regular · getting closer together", with the interval progression only. If progression is null, show the regularity alone. Hidden when regularity is null.
  - [ ] LT-09 "The mini timeline shows the last 60 min: bar x = start, width = duration (min 5 px), height = intensity (unrated = middle height, hollow outline). Event markers are circles. A dotted line marks now." It uses `Timeline variant="mini"`, with caption "Last hour" on the left and "{n} contractions · {event short} HH:MM" (latest event in the window) on the right.
  - [ ] LT-11 "Reopening the app mid-contraction restores the contracting state with the correct elapsed time, within ±1 s." E2E: seed an open contraction with startAt = now − 83 s → reload → the timer reads 1:23 ± 1 s.
  - [ ] LT-15 "The threshold banner (butter tint) appears only when an enabled user threshold is met. It uses role="status" and is dismissible."
    - Text: "Matches the threshold you set — {name}". Bookmark icon; × button labelled "Dismiss".
    - Evaluate `firstMet(settings.thresholds, contractions, now)` after each contraction ends, whenever contraction data changes (covers edits) and every 60 s.
    - After dismissal it reappears only after the rule stops holding and then holds again (in-memory per threshold id).
    - The first match per session calls `markThresholdMet`.
  - [ ] LT-16 "Haptics (navigator.vibrate(15) on start, [10,60,10] on stop) fire only if enabled and supported. Absence is silent." Unit-tested with a vibrate spy, including haptics off and vibrate missing.
  - [ ] Accessibility:
    - The hero's accessible name includes state and time: resting "Start contraction. 3 minutes 42 seconds since the last one started" / "Start contraction. No contractions yet"; contracting "End contraction. 48 seconds so far".
    - An `aria-live="polite"` region announces "Contraction started" and "Contraction ended, lasted 58 seconds".
  - [ ] Timers use `useNow()` (rAF, 1 Hz) and always compute from stored timestamps. Rolling stats use `computeLiveMetrics` memoised, recomputed on every tap and every 15 s.
  - [ ] `src/app/wakeLock.ts`:
    - `isWakeLockSupported(): boolean`.
    - `useWakeLock(active: boolean, enabled: boolean): 'held'|'unavailable'|'off'` requests `navigator.wakeLock.request('screen')` when active && enabled, re-acquires on every visibilitychange to visible, and releases when inactive.
    - Pill: "Screen stays on" (mint, sun icon) when held; "Screen may sleep" (`--text-faint`) when unavailable or failed; hidden when the setting is off. No alert.
    - Unit tests: supported, unsupported, rejected, and visibility re-acquire.
  - [ ] Storage pills and cards: when storage status is `'memory'`, a "Not saved" pill shows in the header. When it is `'failing'`, a quiet card shows "Couldn't save the last tap — free some space, then tap Retry" with a "Retry" button → `retryPendingWrites()`. The tap is still reflected (from the overlay). E2E: an init script makes `IDBObjectStore.prototype.put`/`add` throw `QuotaExceededError` after load → tap → the card appears and the hero shows contracting.
  - [ ] Stale contraction: while an in-progress contraction's elapsed time is > 5 min, the button still shows elapsed time, and a quiet card above it reads "Still going? This one's been running 23 min." with "Ended earlier…" and "Keep timing". Ended earlier… opens a Sheet with a TimeField (between startAt and now) and Save → `stopContraction(id, chosenTime)`. Keep timing hides the card for that contraction. The minutes come from `Math.floor(elapsed / 60000)`.
  - [ ] Long pause: when resting, the session has ≥ 1 contraction, and the last start was ≥ 60 min ago, show "Contractions paused? Last one 1 h 12 m ago." with "Keep session going" (hides it until the next contraction) and "End session…" (opens EndSessionSheet). The session is never ended automatically.
  - [ ] `src/screens/Live/EndSessionSheet.tsx` (exported for Task 8): a Sheet titled "End this session?" with the summary "{n} contractions over {length}" and two buttons, "End session" (→ `endSession(id)`, release the wake lock, `navigate('#/')`) and "Keep going" (close).
  - [ ] Header menu icon button (design answer 1): opens a Sheet with links "All sessions" (`#/history`) and "Settings" (`#/settings`).
  - [ ] Large text (200 % zoom): the stat cards stack vertically, and the hero keeps ≥ 200 px height with the page scrolling. Landscape on a phone: the hero takes the left half; stats and timeline sit on the right (CSS media `(orientation: landscape) and (max-height: 500px)`).
  - [ ] E2E (`live-core.spec.ts`, `live-edge.spec.ts`, both projects): the resting → contracting → resting cycle with a DB check; LT-02/03 labels and the 55 % opacity; LT-04 debounce; LT-05/06/07 with a seeded series (e.g. 12 contractions 4m 20s apart and 55 s long shows "every 4m 20s · 55s long"); 1–3 contractions show "—", "Not enough yet" and a hidden pattern line; LT-09 hollow unrated bars and the event circle; LT-11; the LT-15 banner shows, dismisses and re-shows after the rule breaks and holds again, using a seeded enabled 3-in-10 threshold; the stale card after 6 min with page.clock; the paused card at 61 min; visibilitychange or background with clock fast-forward recomputes the timer on return (the "Phone call" edge row); the wake-lock pill shows "Screen may sleep" when `navigator.wakeLock` is deleted by an init script.
- Validation: `npm test && npm run lint && npm run typecheck && npm run build && npm run e2e`
- Notes for implementer:
  - Spec: docs/implementation-spec.txt "Live tracker (LT)", "While a session is active", "Closing, locking and backgrounding", "Edge cases", "Accessibility". Screens 01 and 02 are the layout truth. Screen 03 shows the banner style (butter title, bookmark icon); ignore its "from your plan with the midwife" copy.
  - Store (Task 3): `useAppStore` (`activeSession`, `activeContraction`, `settings`, `storage`), `useContractions(id)`, `useEvents(id)`, `startContraction`, `stopContraction`, `endSession`, `markThresholdMet`, `retryPendingWrites`.
  - Domain (Task 2): `computeLiveMetrics`, `formatDuration`, `formatTimer`, `formatSpoken`, `formatClock`, `formatSessionLength`, `displayName`, `firstMet`, `bannerText`, event labels and letters.
  - UI kit (Task 4): `HeroButton`, `StatCard`, `Pill`, `Card`, `IconButton`, `Sheet`, `TimeField`, `Timeline`, `useNow`, `useReducedMotion`.
  - Task 8 adds the strength picker, action row (Undo / Started by mistake / Event / Share) and hold-to-end. Leave clearly named slots and don't render placeholders for them.
  - Use `page.clock.install({ time })` before `goto` for time-based tests. Stub `navigator.vibrate` via addInitScript where needed.

### Task 7: History and Compare
- Type: code
- Goal: Build the sessions list with select-to-compare, and the Compare screen.
- Owns: src/screens/History/**, src/screens/Compare/**, e2e/history.spec.ts, e2e/compare.spec.ts
- Depends on: Task 2, Task 3, Task 4
- Acceptance criteria:
  - [ ] Layout per docs/screens/05-history-select.png: back button, title "Sessions", "Select"/"Done" toggle at the right. In select mode the subtitle is "Pick two or three sessions to compare.". Back → `#/live` if a session is active, else `#/`.
  - [ ] HI-01 "Sessions are listed newest first. Each card shows name (or the default name, e.g. "Sunday evening", from the start's weekday and part of day), date and time range, length, count, average time apart, average length and a sparkline. The active session shows the peach "In progress" pill." Card lines: "Sun 25 Oct · 21:40 – now · 2 h 19 m"; a Sparkline; "22 contr. · 6m 20s apart · 48s long".
  - [ ] HI-02 "Tapping a card opens detail. Select enters select mode, showing checkbox circles and a bottom bar "{n} selected · Compare"." In select mode, tapping toggles selection: a checkbox circle with `role="checkbox"`, `aria-checked`, and a lavender outline on selected cards.
  - [ ] HI-03 "Compare is enabled for 2–3 selections. A fourth selection is blocked with the hint "Up to three at a time"." Compare → `#/compare?ids=a,b[,c]`.
  - [ ] HI-04 "The empty state reads "Sessions you time will appear here" with a Start timing link." The link → `#/`.
  - [ ] Compare layout per docs/screens/07-compare.png: back, title "Compare", subtitle "Lined up from each session's start", legend rows (series swatch, name, "· Sun 25 Oct").
  - [ ] CO-01 "The legend distinguishes series by fill and line style (solid lavender vs dashed sky outline), never by colour alone." The third series is a dotted `--text-muted` outline.
  - [ ] CO-02 "Timelines are stacked and aligned at t = 0 on a shared hour axis sized to the longest session." Uses `Timeline variant="compare"` with times offset by each session's start; axis "0 h, 1 h, …".
  - [ ] CO-03 "Interval trends are overlaid as a rolling average of 4." Uses `TrendChart` with `rollingMean(intervals, 4)` lines; title "Time apart", subtitle "minutes, rolling average".
  - [ ] CO-04 "The metrics table shows length, contractions, time apart, lasting, strength and pattern, one column per session." A real `<table>` with `<th scope="col">` (first word of the display name) and `<th scope="row">` (Length, Contractions, Time apart, Lasting, Strength, Pattern). Strength uses the Settings scale format (`formatIntensity`); Pattern is the regularity label or "—".
  - [ ] Invalid or unknown ids, or fewer than 2 valid ids, show "Pick two or three sessions to compare" with a link to `#/history`.
  - [ ] Unit tests for the select logic (max 3, hint) and the compare data shaping. E2E (both projects): newest-first ordering and card stats with seeded sessions; In progress pill; tap opens `#/session/:id`; select 2 → bar "2 selected · Compare" enabled; 1 → disabled; a 4th is blocked with the hint; empty state; Compare renders both series with legend styles, the table values, and an hour axis sized to the longest session.
- Validation: `npm test && npm run lint && npm run typecheck && npm run build && npm run e2e`
- Notes for implementer:
  - Spec: docs/implementation-spec.txt HI-01..04, CO-01..04. Screens 05 and 07.
  - Store (Task 3): `useSessions()`, `useContractions(id)`, `useEvents(id)`, `useAppStore().activeSession`, `useSettings()`. To load several sessions' contractions at once, use `useLiveQuery` over `getDb().contractions.where('sessionId').anyOf(ids)` filtered by `deletedAt == null`.
  - Domain (Task 2): `displayName`, `summarizeWindow`, `countedContractions`, `deriveRows`, `rollingMean`, `regularity`, `formatDuration`, `formatSessionLength`, `formatDateShort`, `formatTimeRange`, `formatIntensity`. UI kit (Task 4): `Sparkline`, `Timeline`, `TrendChart`, `Card`, `IconButton`, `Button`, `Pill`.
  - Router (Task 1): `useRoute().query.get('ids')`, `navigate`, `goBack`.
  - Session-level averages for cards and compare use the whole session (from startedAt to endedAt, or to now when active).

### Task 8: Live interactions (strength picker, Undo / Started by mistake, Event sheet, Share, hold-to-end) and journeys J1, J2, J3, J5
- Type: code
- Goal: Complete the Live screen's corrections and actions and prove J1, J2, J3 and J5 end to end.
- Owns: src/screens/Live/** (extends Task 6's files), e2e/live-actions.spec.ts, e2e/j1-first-contraction.spec.ts, e2e/j2-partner-reads.spec.ts, e2e/j3-mis-tap.spec.ts, e2e/j5-waters-gentle-prompt.spec.ts
- Depends on: Task 5, Task 6
- Acceptance criteria:
  - [ ] Layout per docs/screens/01 (action row Undo / Event / Share; "Press and hold to end session" at the bottom), 02 (contracting: Started by mistake / Event only) and 03 (picker above the hero; while it's open the stat cards, averages, pattern line, mini timeline and end control are hidden).
  - [ ] LT-08 "When a contraction ends, the strength card appears with five options (Mild… Intense) shown as growing dots plus words, a numeric 1–10 row, or both (per Settings). Choosing one saves and closes it. Skip closes it. With no choice it closes after 30 s, with a thin progress bar. It closes immediately if a new contraction starts."
    - It uses `StrengthPicker` with `scale = settings.intensityScale` and `durationLabel = formatDuration(the duration just ended)`.
    - Choosing calls `rateContraction`.
    - The 30 s timer pauses while focus is inside.
  - [ ] LT-10 "Undo reverts the last action (start, stop, rating, event, edit) in one tap, with no confirmation. A toast reads "Undone" for 3 s. Undo depth is 1. During a contraction the left action is labelled Started by mistake."
    - Undo calls `undoLast()` → `showToast({ message: 'Undone', durationMs: 3000 })`.
    - When nothing can be undone (`useUndoAvailable()` false), Undo has `aria-disabled="true"` and does nothing.
    - During a contraction the left button is "Started by mistake" → `discardContraction(activeContraction.id)`, with no confirmation, and the hero returns to resting.
  - [ ] LT-12 "Event opens a bottom sheet with the six types, an optional time (default now) and an optional note. Saving shows a mint marker."
    - Types: Waters broke, Bleeding, Reduced baby movement, Called midwife, Went to hospital, Note.
    - Waters broke reveals the colour choices Clear / Pink / Green or brown / Not sure (radiogroup).
    - The time is a TimeField defaulting to now; the note is optional.
    - On save, the sheet switches to the confirmation "Saved · Waters broke, green or brown, 23:30" (`eventConfirmation`) with a Done button, and closes only on Done (design answer 3).
    - When `needsGentlePrompt`, the line "If you haven't already, contact your midwife or maternity unit." appears below the confirmation inside a `role="status"` region, with no colour change, no icon and no countdown.
  - [ ] LT-13 "Share opens the summary sheet (see SH)." It uses `SummarySheet` with `summaryText({ scope: 'last-hour', … })`.
  - [ ] LT-14 "Ending the session requires a 1.5 s press-and-hold, then a confirmation sheet. It is never a single tap."
    - `HoldToConfirm` is labelled "Press and hold to end session" and opens Task 6's `EndSessionSheet`.
    - An AT click without hold (`detail === 0`) opens the sheet directly.
    - Hidden while contracting.
  - [ ] SH-01 "The summary text follows this template: "Last hour: {n} contractions, every {interval}, lasting about {duration}, strength about {i}/10. {events}"". The E2E asserts the exact text for a seeded fixture.
  - [ ] Edge "Double tap or palm tap": the 600 ms debounce (Task 6), with "Undo covers the rest". The E2E stops a contraction with an accidental tap and then Undo restores it to in-progress.
  - [ ] Edge "Reduced motion": with `reducedMotion: 'reduce'`, the hold-to-end shows the text countdown and the sheets fade (no slide).
  - [ ] J1 spec (`e2e/j1-first-contraction.spec.ts`), both projects: onboarded, no sessions → lands on Start → "Start timing" → Live resting with "No contractions yet" and the button "Tap when it starts" → tap → peach, `navigator.vibrate` spy called with 15 (haptics on), timer reads 0:00 then counts → tap → lavender, picker visible → `page.clock.fastForward(30_000)` → picker gone; the DB intensity is null.
  - [ ] J2 spec: a seeded active session with a regular series → Live shows Time apart and Lasting values and "every 4m 20s · 55s long" for the last 30 min → Share → the sheet shows the summary paragraph with Copy and Share… → Copy shows the toast "Copied" (clipboard permission granted on Chromium; on WebKit assert the button exists) → Event → Called midwife → Save → Done → a mint marker exists on the mini timeline.
  - [ ] J3 spec: tap start → peach → "Started by mistake" → resting, no contraction in the DB, no confirmation. Then: start, wait 1 s, stop → Undo → contracting with the original startAt (DB check) → toast "Undone".
  - [ ] J5 spec: Event → Waters broke → Green or brown → time defaults to now (changeable) → Save → confirmation "Saved · Waters broke, green or brown, HH:MM" plus the gentle prompt in a `role="status"` → Done closes. Repeat for Bleeding and Reduced baby movement (prompt shown) and for Clear (no prompt).
  - [ ] `e2e/live-actions.spec.ts`: picker per scale (words/numeric/both); Skip; closes on a new contraction start; Undo disabled state; hold < 1.5 s cancels; hold 1.5 s → sheet → Keep going keeps the session; End session → `#/` with endedAt set in the DB.
- Validation: `npm test && npm run lint && npm run typecheck && npm run build && npm run e2e`
- Notes for implementer:
  - Spec: docs/implementation-spec.txt LT-08, 10, 12, 13, 14, SH-01, journeys J1/J2/J3/J5, Copy rules. Design answers 3 and the folded-in a11y items.
  - From Task 6 (same directory): LiveScreen's slots, `EndSessionSheet`, and the `data-state` attribute on the hero.
  - Store (Task 3): `rateContraction`, `undoLast`, `useUndoAvailable`, `discardContraction`, `addEvent`, `useEvents`. Domain (Task 2): `summaryText`, `eventConfirmation`, `needsGentlePrompt`, `GENTLE_PROMPT`, event labels, `WORD_SCALE`. UI kit (Task 4): `StrengthPicker`, `Sheet`, `SummarySheet`, `HoldToConfirm`, `TimeField`, `Button`, `showToast`.
  - The ToastHost is mounted by Task 5 in App.tsx.
  - Stub haptics with `page.addInitScript(() => { (window as any).__vib = []; navigator.vibrate = (p) => { (window as any).__vib.push(p); return true; }; })`.

### Task 9: Session detail with charts, editing, notes, PDF and CSV export, and journey J6
- Type: code
- Goal: Build the Session detail screen with all charts, the log, editing, add-missed, notes, share and on-device PDF/CSV export.
- Owns: src/screens/SessionDetail/** (including src/screens/SessionDetail/pdf/**), e2e/session-detail.spec.ts, e2e/export.spec.ts, e2e/j6-fixing-the-record.spec.ts
- Depends on: Task 5, Task 6, Task 7
- Acceptance criteria:
  - [ ] Layout per docs/screens/06-session-detail.png (full scroll). Unknown id → "This session isn't here any more" with back.
  - [ ] SD-01 "The header has back, an editable title (tap → inline input, saves on blur or Enter) and an Export button."
    - Title: tap (pencil) → input → saves via `renameSession` on blur or Enter; Esc cancels; empty → null (default name).
    - Subline: "Sun 25 Oct · 21:40 – now · 2 h 19 m".
    - Back: `goBack('#/history')`.
    - Export (download icon) opens a Sheet with "PDF report" and "CSV data".
  - [ ] SD-02 "Summary: contractions (total and last hour), time apart, lasting and strength averages over the last hour (or the whole session if ended)." Four StatCards: "Contractions 22 / 12 in the last hour", "Time apart 4m 40s / avg, last hour", "Lasting 56s / avg, last hour", "Strength 6/10 / avg, last hour" ("whole session" captions when ended).
  - [ ] SD-03 "The pattern card shows a three-step regularity meter (shape plus label, not colour alone), the range text and three progression rows with icons."
    - Meter: 3 segments; filled count 3/2/1 for Regular/Fairly regular/Irregular; filled = mint pill, empty = hollow outline.
    - Range text: "Every 4–6 min over the last hour".
    - Rows: Time apart / Length / Strength with the progression wording or "steady" / "—".
    - Empty state: "Not enough yet to describe a pattern".
  - [ ] SD-04 "The range control (Last hour / Last 3 h / Whole session) sets the x-domain of all charts. Pinch-zoom and drag-pan work on the time axis; double-tap resets." Segmented control, default Whole session; `useZoomPan` shared across the charts.
  - [ ] SD-05 "Charts: Timeline (hero), Time apart (dots plus a rolling average of 3), Lasting, Strength (unrated count in the subtitle), and Per 10 minutes. Tapping a bar or point shows a tooltip with exact times and an Edit link."
    - Subtitles: Timeline "width = length · height = strength", with event legend lines such as "N · note: had a bath" and a "Threshold met" marker from `thresholdMetAt`; Time apart "minutes · dots each, line = average"; Lasting "seconds"; Strength "out of 10 · {n} not rated"; Per 10 minutes "how midwives ask".
    - Lines are drawn only with ≥ 4 contractions.
    - The tooltip shows start–end, length, interval and rest, plus "Edit".
    - Each chart has `role="img"` with a sentence summary.
  - [ ] SD-06 "The log table is newest first and mixes contractions and events. Each row has an edit pencil; swiping left reveals Delete (soft, undoable). It shows the latest 8 rows plus "Show all {n} entries"."
    - A real `<table>` with `<th scope="col">` columns Start, Lasting, Apart, Str.
    - Strength uses `formatIntensity(…, settings.intensityScale)`.
    - Event rows show a mint ring and the label.
    - Tags "very short" (< 5 s) and "time changed" appear on flagged rows.
    - Swiping left reveals "Delete"; Delete is also in the edit sheet.
    - Delete → toast "Deleted · Undo" (~5 s) whose action calls `undoLast()`.
    - When expanded with > 50 rows, the body is virtualised (@tanstack/react-virtual with spacer rows).
  - [ ] Edit sheet (J6): start and end TimeFields, strength (per scale plus "Not rated"), note, Save, Delete (rose text).
    - Save → `updateContraction` → toast "Saved · Undo".
    - "Edit puts end before start": Save is disabled with the inline hint "The end needs to be after the start".
    - "Edits that overlap another contraction": rejected inline with "Overlaps the one at 23:44" (from `OverlapError.other.startAt`).
    - The event edit sheet has type, details, time, note, Save and Delete.
    - Charts recompute after save (liveQuery).
  - [ ] SD-07 "Add a missed contraction opens a sheet with start time and length. It is rejected inline if it overlaps another contraction." A dashed "+ Add a missed contraction" button opens a sheet with TimeField + DurationField; the new row slots into order.
  - [ ] SD-08 "Notes are a free textarea that autosaves after 500 ms idle." Labelled "Notes"; calls `setSessionNotes`.
  - [ ] SD-09 "Actions: Share summary, PDF report and CSV data (see SH)." "Share summary" (lavender, SummarySheet; scope last-hour for active sessions, whole for ended), "PDF report", "CSV data".
  - [ ] SH-02 "The PDF is generated on device (e.g. jsPDF plus SVG charts): a summary, the timeline, the trend charts and the full table, A4 portrait, light theme."
    - `src/screens/SessionDetail/pdf/buildPdf.ts` is loaded only via `await import()`, together with jspdf and svg2pdf.js.
    - It renders the charts offscreen with light colours (literal colours allowed only in this folder) and inlines computed fills/strokes before `svg2pdf`.
    - It includes the summary text, timeline, Time apart/Lasting/Strength/Per 10 min, the full table and the safety line.
    - Filename `ebb-session-YYYY-MM-DD.pdf`, saved via `saveFile`.
  - [ ] SH-03 "CSV columns: type,start,end,duration_s,interval_s,intensity,note, with ISO 8601 local time and offset." Uses `toCsv` → `saveFile(new Blob([csv], { type: 'text/csv' }), 'ebb-session-YYYY-MM-DD.csv')`.
  - [ ] Edge rows tested here: very short shows the tag in the log and is excluded from the averages shown; rating skipped shows hollow middle-height bars and "{n} not rated"; only 1–3 contractions means charts render without trend lines; past midnight means the chart axis labels the date; clock changed shows the "time changed" tag; very long session (seeded 24 h, 320 contractions) means the log is virtualised (the DOM row count stays < 80 when expanded).
  - [ ] J6 spec (`e2e/j6-fixing-the-record.spec.ts`), both projects: seeded active session → Live → tap the header name "Tonight" → Session detail. Also from History → card → detail. Pencil on a row → change start/end/strength/note → Save → values update in the log and stats. Add a missed contraction (start + length) → appears in order. An overlapping add is rejected with "Overlaps the one at HH:MM". Tap the title → type "Saturday morning" → Enter → the title persists after reload.
  - [ ] `e2e/session-detail.spec.ts` covers SD-02..06 and SD-08 (autosave after 500 ms via page.clock, persists after reload), delete plus "Deleted · Undo" restoring the row, and the range control changing the axis. `e2e/export.spec.ts`: CSV download has the exact header and a row count; PDF download starts with `%PDF` and is > 10 kB; the jspdf chunk is not requested before clicking PDF (request log).
- Validation: `npm test && npm run lint && npm run typecheck && npm run build && npm run e2e`
- Notes for implementer:
  - Spec: docs/implementation-spec.txt SD-01..09, SH-01..03, Edge cases. Screen 06 (tall; view at full resolution).
  - Store (Task 3): `useSession`, `useContractions`, `useEvents`, `useSettings`, `renameSession`, `setSessionNotes`, `updateContraction` (throws `OverlapError { other }` / `RangeError`), `addMissedContraction`, `deleteContraction`, `updateEvent`, `deleteEvent`, `undoLast`.
  - Domain (Task 2): `computeSessionMetrics` (memoised), `summaryText`, `toCsv`, `formatIntensity`, `formatDuration`, `formatClock`, `displayName`, event letters and labels, `findOverlap` (for instant inline validation before saving).
  - UI kit (Task 4): `Timeline`, `TrendChart`, `FrequencyBars`, `useZoomPan`, `ChartTooltip`, `StatCard`, `Segmented`, `Sheet`, `SummarySheet`, `TimeField`, `DurationField`, `Button`, `showToast`, `saveFile`.
  - The JS budget (120 kB gzip, static graph) is enforced by `npm run build`. Keep jspdf/svg2pdf behind dynamic import only.

### Task 10: Settings (thresholds, scale, look, toggles, data) and journey J4
- Type: code
- Goal: Build the Settings screen, including the custom threshold editor and backup/restore/delete-all, and prove J4.
- Owns: src/screens/Settings/**, e2e/settings.spec.ts, e2e/data.spec.ts, e2e/j4-threshold-met.spec.ts
- Depends on: Task 5, Task 6
- Acceptance criteria:
  - [ ] Layout per docs/screens/08-settings.png: back (→ `#/live` if active, else `#/`) and title "Settings". Sections: "Your thresholds", "Strength scale", "Look", the toggles card, and "Your data".
  - [ ] SE-01 "Threshold presets: 3 in 10 min; 5-1-1; 4-1-1; 3-1-1, all off by default. + Custom threshold lets the user define either N in M minutes or A-L-D (apart ≤ A min, lasting ≥ L min, for D hours)."
    - Intro: "None are on until you choose. Pick what your midwife or unit told you — a gentle note appears when it's met."
    - Each row shows `thresholdName` with `thresholdDescription` and a butter `Switch`.
    - "+ Custom threshold" opens a Sheet with type (N in M minutes | A-L-D), the values, and an optional label. Validation uses `validateCustom`; Save is disabled with an inline hint when invalid.
    - Custom thresholds can be edited (tap the row) and deleted. Presets can be toggled but not deleted.
  - [ ] SE-02 "Strength scale (5 words / 1–10 / Both); Look (Night / Day / Match phone)." Two Segmented controls mapped to `intensityScale` words/numeric/both and `theme` night/day/system. Theme applies immediately (Task 5's theme.ts reacts).
  - [ ] SE-03 "Toggles: Keep screen awake, Gentle buzz and Breathing glow, all on by default." Mint Switches with descriptions "During a session", "On start and stop", "Slow pulse during a contraction". Edge "Wake Lock unsupported": when `!isWakeLockSupported()`, below Keep screen awake show "This browser can't keep the screen on. You can raise the auto-lock time in your phone's display settings."
  - [ ] SE-04 "Data: Back up everything (JSON), Restore from a backup (file input, preview counts, then Merge or Replace) and Delete all data… (rose text, typed confirmation "delete")."
    - The butter panel reads "Everything lives only on this phone. Clearing the browser's data removes it, so a backup now and then is worth it. Last backup: {formatRelativeDays}."
    - "Back up everything" → `exportBackup` + `saveFile`.
    - "Restore from a backup" is a real `<label>`+`<input type="file" accept="application/json,.json">` → `parseBackup`. Invalid → "This file isn't an Ebb backup" and nothing changes. Valid → preview "{s} sessions, {c} contractions, {e} events" with "Merge" / "Replace". After restore, show "Added {added}, skipped {skipped}". Replace shows the confirmation line "A copy of your current data was saved first" (snapshot taken by `restoreBackup`).
    - Restore is disabled during an active session, with the hint "Finish the current session before restoring".
    - "Delete all data…" is rose text and opens a Sheet asking you to type "delete"; the confirm button is enabled only on an exact match → `deleteAllData()` → `navigate('#/')` → Welcome.
  - [ ] SE-05 "The safety line and the app version appear at the bottom." `SafetyLine` plus "Version {__APP_VERSION__}". When `useUpdateReady()` is true, show "Update ready — restart the app to use it".
  - [ ] J4 spec (`e2e/j4-threshold-met.spec.ts`), both projects: active session → Settings → switch on "3 in 10 min" → back → Live. Run 3 contractions within 10 minutes using page.clock (start/stop taps with fast-forward). After the third ends, the butter banner "Matches the threshold you set — 3 in 10 min" is visible with `role="status"`. × dismisses it. Fast-forward until the rule no longer holds and then make it hold again → the banner reappears. The session's `thresholdMetAt` is set in the DB.
  - [ ] `e2e/data.spec.ts`: backup downloads `ebb-backup-YYYY-MM-DD.json` with `app:"ebb"`, `schema:1` and seeded counts; afterwards Start shows "Back up · today" (the J7 step 4 precondition). Restore Merge of an overlapping file shows the added/skipped counts. A corrupt file and a `schema: 2` file are rejected with the exact message and the DB is unchanged. Replace snapshot: `caches.open('ebb-backups')` has ≥ 1 entry afterwards. Restore is disabled with the hint during an active session. Delete all needs exactly "delete", clears the DB and lands on Welcome.
  - [ ] `e2e/settings.spec.ts`: presets all off by default; custom threshold create/edit/delete with an invalid input disabling Save; scale change reflected in Live's picker; Day theme sets `html[data-theme="day"]` and background `rgb(247, 244, 251)`; toggles persist; Breathing glow off hides the breathing caption on Live; the wake-lock help appears when `navigator.wakeLock` is removed; safety line and version visible.
- Validation: `npm test && npm run lint && npm run typecheck && npm run build && npm run e2e`
- Notes for implementer:
  - Spec: docs/implementation-spec.txt SE-01..05, SH-04, "Threshold evaluation", edge rows (Restore overlap, Corrupt backup, Delete all, Wake Lock unsupported). Design answers: custom threshold editor; safe Replace; Restore disabled during an active session.
  - Store (Task 3): `useSettings`, `updateSettings`, `useAppStore().activeSession`, `exportBackup`, `parseBackup`, `restoreBackup`, `deleteAllData`. Domain (Task 2): `thresholdName`, `thresholdDescription`, `validateCustom`, `formatRelativeDays`. UI kit (Task 4): `Switch` (tone butter for thresholds, mint for toggles), `Segmented`, `Sheet`, `Button`, `SafetyLine`, `saveFile`. App (Task 5): `useUpdateReady()`; Task 6: `isWakeLockSupported()` from src/app/wakeLock.ts. Router: `goBack`, `navigate`.
  - Threshold ids: presets use `preset-*` ids from src/db/defaults.ts; custom ones use `crypto.randomUUID()` with `preset: false`.

### Task 11: Quality gates (J7, accessibility, motion, text size, landscape, multi-tab, offline, performance, copy sweep)
- Type: code
- Goal: Prove the cross-cutting requirements and J7 end to end across both device projects, fixing any defects found anywhere in src/.
- Owns: e2e/j7-end-compare-backup.spec.ts, e2e/quality/**, lighthouserc.json, package.json (scripts only: add `audit:lighthouse`), and any src/** file needed to fix defects these specs reveal (this task runs alone in its wave)
- Depends on: Task 8, Task 9, Task 10
- Acceptance criteria:
  - [ ] J7 spec, both projects: on Live with a seeded active session ("Tonight") plus an ended "Tuesday evening", press and hold "Press and hold to end session" for 1.5 s (releasing at 1.0 s first cancels) → sheet "End this session?" with the summary and End session / Keep going → End session → `#/` Start with endedAt set. Then History → Select → Tonight and Tuesday evening → Compare → both legends visible. Then Settings → Back up everything → a download named `ebb-backup-{today}.json` (with page.clock at 2026-10-25 this is `ebb-backup-2026-10-25.json`) → back to Start → the button reads "Back up · today".
  - [ ] `e2e/quality/axe.spec.ts`: @axe-core/playwright with tags wcag2a, wcag2aa, wcag21aa and wcag22aa reports zero violations on Welcome, Start, Live (resting, contracting, picker, banner), History (normal and select), Session detail, Compare, Settings, and each open sheet.
  - [ ] `e2e/quality/a11y-semantics.spec.ts`:
    - The hero's accessible name matches /^Start contraction\. .* since the last one started$/ and /^End contraction\./.
    - The live region announces "Contraction started" / "Contraction ended, lasted N seconds".
    - Switches have `role="switch"` + `aria-checked`; the strength picker has `role="radiogroup"`.
    - Charts have `role="img"` with a non-empty label.
    - Keyboard-only: Tab focus shows a 3 px lavender outline with 2 px offset, and mouse clicks show none.
    - Under `prefers-contrast: more` the computed `--text-muted` is #D6D0E8.
  - [ ] `e2e/quality/motion.spec.ts` (Edge "Reduced motion"): with `reducedMotion: 'reduce'` there is no glow element/animation, the breathing caption is hidden, sheets don't transform (fade only), and hold-to-end shows the text countdown. With the Breathing glow setting off, there is no glow even with motion allowed. The glow's animation-play-state is paused when the document is hidden.
  - [ ] `e2e/quality/layout.spec.ts`:
    - Large text: at 200 % text zoom (CSS zoom / root font-size 200 %) Live's stat cards stack and the hero is ≥ 200 px tall with scrolling.
    - Landscape (844×390): the hero is in the left half, and stats and timeline are on the right.
    - At 390×844 the hero is ≥ 240 px tall, every button is ≥ 48×48, stat values don't wrap, and no text is below 12 px.
  - [ ] `e2e/quality/copy.spec.ts`: on every screen and sheet state, `document.body.innerText` contains no "!" and none of the forbidden phrases (Global Constraints). The safety line is verbatim on Welcome, Start and Settings. No computed colour on any element equals pure red/white (#FF0000, #FFFFFF) in the Night theme.
  - [ ] `e2e/quality/multi-tab.spec.ts` (Edge "Ebb open in two tabs"): two pages in one context on `#/live` → a tap in page A switches page B to contracting within 1 s → a stop in B is reflected in A. The DB never has two open contractions.
  - [ ] `e2e/quality/offline.spec.ts` (DoD airplane-mode test): load, wait for the SW to control, `context.setOffline(true)`, close the page, open a new page at baseURL → it lands correctly and J1's steps run offline (Start timing → tap → tap → picker). No foreign requests at any point.
  - [ ] `e2e/quality/sw-update.spec.ts`: simulate a waiting worker during an active session (e.g. via the mocked `registerSW` path or a rebuilt sw with a changed revision) and assert there is no reload and no activation while a session is active, and that Settings shows "Update ready — restart the app to use it".
  - [ ] `e2e/quality/perf.spec.ts` (Chromium project only):
    - Tap → visual change < 100 ms (median of 10).
    - DB commit p95 < 50 ms (measured in-page around repository calls, via `performance.mark` added in src/db/queue.ts if missing).
    - Cached reopen: first-contentful-paint < 500 ms and interactive (hero enabled) < 1 s, from PerformanceObserver.
    - On a seeded 24 h / 320-contraction session, a scripted 2 s pan on the Session detail timeline keeps the median frame interval ≤ 17 ms (rAF timestamps).
    - The expanded log is virtualised.
  - [ ] `lighthouserc.json` plus `npm run audit:lighthouse` (`lhci autorun` via npx against `npm run preview`), asserting PWA installable, accessibility ≥ 0.95 and performance ≥ 0.90. This is documented in README and is not part of `npm test`/`npm run e2e`.
  - [ ] All earlier specs still pass. `npm run build` passes the 120 kB budget.
- Validation: `npm test && npm run e2e && npm run lint && npm run typecheck && npm run build`
- Notes for implementer:
  - Spec: docs/implementation-spec.txt "User journeys" J7, "Accessibility, PWA and performance", "Edge cases" (Reduced motion, Large text, Landscape, Two tabs, Very long session), "Definition of done". The screenshots in docs/screens/ are the layout reference for any layout fixes.
  - Fix defects in the owning module rather than special-casing tests. Keep fixes minimal and explain each in the commit message.
  - Helpers: e2e/fixtures.ts (network guard), e2e/helpers/db.ts (`onboard`, `seedDb`, `readDb`, `makeSession`, `buildSeries`). Use `page.clock.install({ time: new Date('2026-10-25T23:00:00').getTime() })` so dates are deterministic.
  - Hero state is exposed as `[data-state]`; the threshold banner and toasts are `role="status"`.

### Task 12: Human verification on real devices
- Type: human
- Goal: Complete the Definition of Done checks that can't be automated reliably.
- Owns: none
- Depends on: Task 11
- Acceptance criteria:
  - [ ] Side by side at 390 × 844, every screen matches docs/screens/01–08 for layout. Nunito rendering differs slightly, as the spec notes.
  - [ ] VoiceOver pass on an iPhone: complete J1 and the end-session flow by VoiceOver alone. Every control has a sensible name, and the hero announces state and time.
  - [ ] Real-device airplane-mode test: install to the home screen (iOS Safari and Android Chrome), open once, enable airplane mode, kill the app, reopen, and run J1.
  - [ ] Run `npm run audit:lighthouse` (or Chrome DevTools Lighthouse on the preview): PWA installable, Accessibility ≥ 95, Performance ≥ 90.
  - [ ] An 8 h screen-on session on a phone shows the screen staying awake ("Screen stays on") with no visible animation besides the 1 Hz timer and the optional glow.
- Validation: The human closes this task's issue with a short note of the results, and files new issues for any defects.
- Notes for implementer: The checks need physical devices, a screen reader and a judgement on visual match, which CI can't provide. Use `npm run build && npm run preview -- --host` to serve on the LAN; for the iOS install, use HTTPS (e.g. a temporary static host or a tunnel), because service workers need a secure context.
