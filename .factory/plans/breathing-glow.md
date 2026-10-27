---
feature: breathing-glow
status: done
---
# Breathing glow: configurable in/out timing and a larger, more visible glow

**Spec:** /Users/marcostagni/dev/personal/ebb/.factory/plans/breathing-glow.spec.md (design answers: /Users/marcostagni/dev/personal/ebb/.factory/plans/breathing-glow.design-answers.md; binding v1 spec: /Users/marcostagni/dev/personal/ebb/docs/implementation-spec.txt)
**Goal:** Let the user set separate breathe-in and breathe-out durations in Settings, and make the contraction glow a much larger, more visible soft peach disc that sits under the other Live content without changing the tap target.

## Summary
Two new settings, `breatheInSeconds` and `breatheOutSeconds` (integers 3–8, default 4 each), are backfilled with defaults for existing rows and older backups. The glow becomes a 420 px soft peach disc (1.4 × the 300 px button) that scales 0.7 → 1 at 40 → 90 % opacity. Its keyframes are generated per (in, out) pair, so the peak sits at in/(in+out). The animation stays CSS-only, ease-in-out, paused when hidden, and off under reduced motion or when the switch is off. Live slots are stacked so the glow paints under every other slot. The caption becomes an opaque pill and dimmed stat cards get an opaque background, which keeps text AA. Settings shows two `Segmented` pickers under the switch. The binding spec text is updated to match.

## Decisions
- In/out durations are separate, with no hold → two controls (source: human)
- Default timing → 4 s in + 4 s out, the same 8 s cycle as today (source: human)
- Range, step and control type → integers 3–8 s, 1 s steps, each picked with the existing `Segmented` radiogroup offering "3 s" … "8 s" (source: planner; follows the design critic's 3–8 s example)
- Setting names → `breatheInSeconds: number` and `breatheOutSeconds: number` on `Settings` (source: planner)
- Asymmetric animation → a `@keyframes breathe-<in>-<out>` rule is generated at runtime and injected once into a `<style data-ebb-breathe>` in `document.head` via `useInsertionEffect`. The peak keyframe sits at `in/(in+out)` (3-decimal %), `animation-duration` is `(in+out)s`, and the timing function stays `ease-in-out` (applied per segment). This is still a CSS animation (`CSSAnimation`, name matches `/breathe/`). CSS keyframe selectors cannot use `var()`, which is why the rule has to be generated (source: planner)
- Glow geometry → a 420 px disc (`--glow-size: 420px` = 1.4 × 300) centred on the button with negative margins, never with `translate`. Fill is `radial-gradient(circle closest-side, var(--hero-colour) 80%, transparent 100%)`, no `filter`. Keyframes go from `scale(0.7)` / opacity 0.4 (294 px, at or below the button edge, so the smallest frame hides behind the button) to `scale(1)` / opacity 0.9 at the peak (source: planner, within human answer 2)
- The glow stays a child of HeroButton with `pointer-events: none` → clicks in the glow ring fall through and the tap target stays the button (source: planner)
- Glow under other content → in Live, `.slot { position: relative; z-index: 1 }` and `.slot[data-slot='hero'] { z-index: 0 }`. Sheets portal to `<body>` (src/components/Sheet/Sheet.tsx uses `createPortal`), so they are unaffected (source: planner)
- AA over the glow → the caption becomes an opaque `var(--surface)` pill. Dimmed StatCards get an opaque background `color-mix(in srgb, var(--surface) 55%, var(--bg))` (identical to today's look over `--bg`) and their children get opacity 0.55 instead of the whole card. The glow can overlap the stat cards on short phones such as iPhone 13 (664 px viewport). The header is never reached in portrait because the stats always sit between it and the hero while contracting (source: planner)
- Clipping → portrait relies on the existing `.screen { overflow-x: clip }`. Landscape adds `overflow-x: clip` on the hero slot so the glow stays inside the left column (source: planner)
- A timing change never jumps mid-breath → the glow snapshots its timing when it mounts, which is at contraction start or when Live remounts. A change applies from the next contraction (source: planner, from folded-in calm-motion rule)
- Settings visibility → timing pickers show only when the switch is on and reduced motion is off. Under reduced motion, a help line appears under the switch (source: human folded-in suggestion; hiding the pickers under reduced motion is planner)
- Switch description → "Slow pulse during a contraction · in N s, out M s" when the pickers are shown, otherwise "Slow pulse during a contraction" (source: human folded-in suggestion + planner)
- Backups → a backup without the new fields is valid and restores with 4/4. If the fields are present they must be integers 3–8, otherwise the backup is rejected (source: planner)
- `Segmented` group gets `flex-wrap: wrap` so six options reflow at 200 % zoom (source: planner)
- Binding spec → update docs/implementation-spec.txt only (source: human folded-in suggestion)

## Global Constraints
- Human answer 1: "SEPARATE breathe-in and breathe-out durations (two controls), no hold." The default must reproduce today's 8 s cycle, which is 4 s in + 4 s out.
- Human answer 2: "the glow grows well past the 300 px circle (about 1.4×, near screen width), soft peach at higher opacity, sits UNDER the other content (cards, caption, action row), which stays opaque/legible with AA contrast. The glow is decorative and never interactive (pointer-events: none) so the tap target stays exactly the 300 px circle; its smallest size stays at or below the button edge so "in as it grows" still reads; no new colour; clipped by the screen (no horizontal scroll); in landscape bounded by the left hero column."
- Calm-motion rules: "each contraction starts on the inhale (smallest, faintest frame); a timing change applies from the next cycle/contraction, never jumping mid-breath; centred grow/fade only, ease-in-out, no translation, no overshoot, no blur flicker."
- Hard constraints from the v1 spec: no flashing, no bounces/shakes, calm pastel palette, no red. The animation is CSS-only and pauses when hidden. It is disabled under prefers-reduced-motion and by the Settings toggle. Battery: "no animation besides the 1 Hz timer and the optional glow, which uses CSS only and pauses when hidden". WCAG 2.2 AA. The button stays a single big tap target.
- Copy rules: no red, no alarms, no countdowns, no exclamation marks, no medical labels. UK spelling, sentence case.
- The only file allowed to contain colour literals is src/styles/tokens.css.
- Values: `breatheInSeconds` and `breatheOutSeconds` are integers in [3, 8], default 4. Keyframe name `breathe-<in>-<out>`. Duration `(in+out)s`. Peak at `in/(in+out)·100 %`. Glow 420 px, `scale(0.7)` / opacity 0.4 → `scale(1)` / opacity 0.9. Timing function `ease-in-out`.
- Exact copy:
  - Switch label "Breathing glow"
  - Switch description "Slow pulse during a contraction · in 4 s, out 4 s" (with the chosen values) or "Slow pulse during a contraction"
  - Picker labels "Breathe in" and "Breathe out"
  - Options "3 s", "4 s", "5 s", "6 s", "7 s", "8 s"
  - Reduced-motion help line "Your phone is set to reduce motion, so the glow stays off"
  - Live caption unchanged: "Breathe with the glow — in as it grows, out as it fades"
- Older backups and existing stored settings that lack the new fields must load and restore with the defaults.
- Commands: test `npm test && CI=1 npm run e2e`; lint `npm run lint && npm run typecheck`; build `npm run build`.

## Waves
- Wave 1: Task 1, Task 4 (no shared Owns, no deps)
- Wave 2: Task 2 (needs 1), Task 3 (needs 1)

## Open questions left unresolved (non-blocking)
- docs/implementation-spec.pdf is not regenerated, so only the .txt extraction is updated. If the PDF must match, that is a human step after merge. The human asked for the spec update in the .txt sense, so this does not block.
- The two halo rings (inset −10/−22 px) are children of the button without `pointer-events: none`, so taps up to 22 px outside the circle still hit the button, as they do today in v1. Left unchanged as existing behaviour.
- Day theme dimmed stat card label contrast is about 3.5:1, the same as v1 (3.59 → 3.48 with the new dimming). It is pre-existing and the axe states run in the default night theme.

## Tasks

### Task 1: Settings fields for breathe-in/out with defaults, backfill and backup validation
- Type: code
- Goal: Add `breatheInSeconds` and `breatheOutSeconds` (integers 3–8, default 4) to Settings. Every read path, older backups included, must yield them with defaults.
- Owns: src/db/types.ts, src/db/defaults.ts, src/db/reads.ts, src/db/settings.ts, src/db/backup.ts, src/db/backup.test.ts, src/db/repositories.test.ts (settings cases only), src/state/store.ts, src/state/store.test.ts, e2e/data.spec.ts
- Depends on: none
- Acceptance criteria:
  - [ ] `Settings` in src/db/types.ts has `breatheInSeconds: number; breatheOutSeconds: number;` and `DEFAULT_SETTINGS` has both = 4.
  - [ ] src/db/defaults.ts exports `BREATHE_SECONDS = [3, 4, 5, 6, 7, 8] as const` and `withSettingsDefaults(row: Partial<Settings>): Settings`, which returns `{ ...structuredClone(DEFAULT_SETTINGS), ...row }`.
  - [ ] `getSettingsRow()` (src/db/reads.ts) returns `withSettingsDefaults(...)` for both the intended-write overlay value and the DB row, and still returns `undefined` when there is no row. As a result `getSettings()` / `updateSettings()` yield the defaults for a stored row lacking the fields.
  - [ ] The store's `derive()` (src/state/store.ts) runs the merged settings through `withSettingsDefaults`, so `useAppStore.getState().settings.breatheInSeconds === 4` after the DB is seeded with a v1-shaped settings row lacking the fields (unit test).
  - [ ] `parseBackup` accepts settings that lack the two fields and returns `backup.settings` with them filled as 4. It accepts integers 3–8. It returns the not-a-backup rejection for e.g. `breatheInSeconds: 2`, `9`, `4.5` or `'4'` (unit tests).
  - [ ] Replace restore writes settings that include the fields: a backup without them leaves the stored row at 4/4 (unit test). Merge still keeps device settings (existing test passes).
  - [ ] e2e/data.spec.ts: the existing backup fixture in `makeSessionRows` (which lacks the new fields) restores with Replace, and `readDb(page).settings` then has `breatheInSeconds: 4, breatheOutSeconds: 4` (add the assertion to an existing replace test or one new test).
  - [ ] `npm run lint && npm run typecheck` clean, `npm test` green.
- Validation: `npm run lint && npm run typecheck && npm test && CI=1 npm run e2e -- e2e/data.spec.ts`
- Notes for implementer:
  - backup.ts `isSettings` uses `shaped()`, which calls each check with `v[k]`. Add `breatheInSeconds: optBreath, breatheOutSeconds: optBreath` with `const optBreath = (x: unknown) => x === undefined || (Number.isInteger(x) && (x as number) >= 3 && (x as number) <= 8)`.
  - On success, return `backup: { ...data, settings: withSettingsDefaults(settings as Partial<Settings>) } as Backup`.
  - In `restoreBackup` replace mode, the `db.settings.put({ ...backup.settings, onboardedAt })` line then gets full settings. Defensively wrap it with `withSettingsDefaults` too.
  - In store.ts `derive()`, wrap at the `stripId(settings)` result: `settings: settings ? withSettingsDefaults(stripId(settings)) : structuredClone(DEFAULT_SETTINGS)`. Also look at line ~57 `lastSnapshot.settings ?? DEFAULT_SETTINGS`.
  - e2e/helpers/db.ts seeds `{ ...DEFAULT_SETTINGS, ... }`, so seeded settings pick up the new fields automatically once defaults.ts changes.
  - No Dexie schema version bump is needed: the `settings` table is keyed `''` with no indexes on these fields.
  - Do not touch UI files. Tasks 2 and 3 consume these fields.

### Task 2: Larger glow with asymmetric in/out timing on Live
- Type: code
- Goal: Render the contraction glow as a 420 px soft peach disc whose CSS animation follows the user's in/out timing. It paints under all other Live content, never takes taps and never causes horizontal scroll.
- Owns: src/components/HeroButton/HeroButton.tsx, src/components/HeroButton/HeroButton.module.css, src/components/HeroButton/breathe.ts (new), src/components/HeroButton/breathe.test.ts (new), src/components/HeroButton.test.tsx, src/components/StatCard/StatCard.tsx, src/components/StatCard/StatCard.module.css, src/components/StatCard.test.tsx, src/styles/tokens.css, src/screens/Live/LiveHero.tsx, src/screens/Live/index.tsx, src/screens/Live/Live.module.css, src/screens/Live/Live.test.tsx, e2e/quality/motion.spec.ts, e2e/quality/layout.spec.ts, e2e/live-core.spec.ts
- Depends on: Task 1
- Acceptance criteria:
  - [ ] src/components/HeroButton/breathe.ts exports `breatheKeyframes(inS: number, outS: number): { name: string; css: string }`. `name` is `breathe-${inS}-${outS}`. `css` is `@keyframes <name> { 0%, 100% { transform: scale(0.7); opacity: 0.4; } <peak>% { transform: scale(1); opacity: 0.9; } }` with peak = `Number((inS / (inS + outS) * 100).toFixed(3))`, e.g. 4/4 → `50%`, 6/3 → `66.667%`, 3/8 → `27.273%`. It also exports `ensureBreatheKeyframes(inS, outS): string`, which appends the rule once per name to a single `<style data-ebb-breathe>` in `document.head` and returns the name. Unit tests cover the peak maths and idempotence (calling twice adds one rule).
  - [ ] `HeroButtonProps` gains `glowTiming?: { inSeconds: number; outSeconds: number }` (default `{ inSeconds: 4, outSeconds: 4 }`). The glow is a small inner component mounted only when `glow && !reducedMotion`. It captures the timing in `useState` at mount, injects keyframes in `useInsertionEffect`, and sets inline `animationName`, `animationDuration: '<in+out>s'` and `animationPlayState` (paused when `document.hidden`). Unit test: rerendering with a different `glowTiming` while the glow stays mounted leaves `animationName` / `animationDuration` unchanged, and toggling `glow` off then on picks up the new timing.
  - [ ] HeroButton.module.css `.glow`:
    - `position: absolute; left: 50%; top: 50%; width: var(--glow-size); height: var(--glow-size); margin: calc(var(--glow-size) / -2);`
    - `border-radius: 50%; z-index: 1; pointer-events: none;`
    - `background: radial-gradient(circle closest-side, var(--hero-colour) 80%, transparent 100%);`
    - `opacity: 0.4; transform: scale(0.7); animation-timing-function: ease-in-out; animation-iteration-count: infinite;`
    - no `filter`, no `translate` in any keyframe
    - the old `@keyframes breathe` block is removed
  - [ ] src/styles/tokens.css: `--glow-duration: 8s;` is replaced by `--glow-size: 420px;` and no other file references `--glow-duration` (grep).
  - [ ] LiveHero takes `breatheInSeconds` / `breatheOutSeconds` props and passes `glowTiming` to the contracting HeroButton. Live index passes `settings.breatheInSeconds` / `settings.breatheOutSeconds`.
  - [ ] Live.module.css:
    - `.slot` gets `position: relative; z-index: 1;` and `.slot[data-slot='hero']` gets `z-index: 0;`
    - `.breathe` becomes an opaque pill: `width: fit-content; margin: 0 auto; padding: var(--space-2) var(--space-4); border-radius: var(--radius-pill); background: var(--surface);` with text unchanged
    - inside the existing landscape media query, `.slot[data-slot='hero']` gets `overflow-x: clip;`
  - [ ] StatCard dimming: the inline `style={{ opacity: 0.55 }}` is removed. `.card[data-dimmed='true']` gets `background: color-mix(in srgb, var(--surface) 55%, var(--bg));` and `.card[data-dimmed='true'] > * { opacity: 0.55; }`, keeping the existing `--text-muted` / `--text-faint` overrides. StatCard.test asserts card opacity is not 0.55 and a child has opacity 0.55 (via `data-dimmed` + class, since jsdom does not apply CSS modules: assert the inline style is gone and `data-dimmed="true"`). e2e/live-core.spec.ts line ~64 asserts `page.getByText('Time apart')` has CSS opacity `0.55` instead of its parent card.
  - [ ] e2e/quality/motion.spec.ts "motion allowed":
    - the existing 8 s test expects `{ name: 'breathe-4-4', duration: '8s', iteration: 'infinite', timing: 'ease-in-out', state: 'running' }`
    - new test: `openApp(page, 'busy', '#/live', { breatheInSeconds: 6, breatheOutSeconds: 3 })` → glow `animation-name` `breathe-6-3`, duration `9s`, and the matching `CSSKeyframesRule` found in `document.styleSheets` has a keyframe with `keyText` `66.667%`
    - new test: the glow's computed `pointer-events` is `none`, its `offsetWidth` is 420, the hero button bounding box is 300 × 300, and `document.elementFromPoint(centreX, buttonTop - 30)` is not contained by the button
  - [ ] The existing reduced-motion, switch-off and visibility-pause tests still pass unchanged.
  - [ ] e2e/quality/layout.spec.ts:
    - phone portrait 390 × 844 while contracting: `document.documentElement.scrollWidth <= clientWidth`
    - 200 % zoom test: after the final click to contracting, re-check sideways is false
    - landscape 844 × 390 while contracting: the hero slot (`[data-slot="hero"]`) has computed `overflow-x` `clip` and the hero button's right edge is ≤ 422
  - [ ] e2e/quality/axe.spec.ts (unchanged) passes for "Live, contracting", "Live, still going card" and all other states. e2e/quality/perf.spec.ts passes.
  - [ ] `npm run lint && npm run typecheck` clean, `npm test` and `CI=1 npm run e2e` green, `npm run build` succeeds.
- Validation: `npm run lint && npm run typecheck && npm test && npm run build && CI=1 npm run e2e`
- Notes for implementer:
  - Why the glow can stay inside the button: the button has `isolation: isolate`, so its whole stacking context paints at the hero slot's level. Giving the hero slot z-index 0 and every other `.slot` z-index 1 puts the glow under caption, stats, notices and action row. The face (z 2) still covers the glow inside the button. Sheets use `createPortal`, so slot stacking contexts do not trap them. Toast is fixed and rendered outside Live.
  - Use margins for centring. The animation owns `transform`, so a `translate(-50%,-50%)` would be overwritten. Calm rules forbid translation anyway.
  - At `scale(0.7)` the disc is 294 px with a solid core to 80 % of its radius, so the inhale frame hides behind the 300 px face. "Starts on the inhale" holds because the glow element mounts at contraction start and keyframe 0 % is the smallest, faintest frame.
  - `useInsertionEffect` exists in React 18. In jsdom, `document.head` works. Keep the generated CSS free of colour literals (it only has transform/opacity).
  - motion.spec `animationNames` regex `/breathe/` still matches `breathe-4-4`.
  - To read keyframes in e2e: `[...document.styleSheets].flatMap(s => [...s.cssRules]).find(r => r instanceof CSSKeyframesRule && r.name === 'breathe-6-3')`.
  - In portrait, horizontal clipping comes from the existing `.screen { overflow-x: clip }`. Do not change it to `hidden`, which would create a scroll container.
  - Seeding: e2e/quality/states.ts `openApp(page, seed, hash, settings)` takes `Partial<Settings>`. Task 1 adds the fields to the type.
  - Do not touch src/screens/Settings/* (Task 3).

### Task 3: Settings controls for breathe-in/out under the Breathing glow switch
- Type: code
- Goal: Under "Breathing glow", show "Breathe in" and "Breathe out" pickers (3–8 s), hidden when the switch is off or motion is reduced. Add a reduced-motion help line and a description that shows the chosen timing.
- Owns: src/screens/Settings/index.tsx, src/screens/Settings/Settings.module.css, src/screens/Settings/Settings.test.tsx, src/components/Segmented/Segmented.module.css, e2e/settings.spec.ts, e2e/quality/a11y-semantics.spec.ts
- Depends on: Task 1
- Acceptance criteria:
  - [ ] In the toggles card, the Breathing glow `<li>` keeps the `Switch` (tone mint, label "Breathing glow"). Its `description` is `Slow pulse during a contraction · in ${breatheInSeconds} s, out ${breatheOutSeconds} s` when the pickers are shown, otherwise `Slow pulse during a contraction`.
  - [ ] When `settings.breathingGlow && !reducedMotion` (use `useReducedMotion` from src/lib/useReducedMotion), two pickers render directly under the switch inside the same `rowMain`. Each has a visible text label ("Breathe in", "Breathe out") followed by `<Segmented label="Breathe in" | "Breathe out" options={["3 s"…"8 s"]} value={String(n)} onChange={v => updateSettings({ breatheInSeconds: Number(v) })} />` (or `breatheOutSeconds`). Option values are "3"…"8", labels "3 s"…"8 s", built from `BREATHE_SECONDS` in src/db/defaults.ts.
  - [ ] When the switch is off, neither radiogroup is in the DOM.
  - [ ] Under reduced motion, neither radiogroup renders and `<p className={styles.help}>Your phone is set to reduce motion, so the glow stays off</p>` appears under the switch, reusing the same pattern as the Keep screen awake help line. The switch stays operable.
  - [ ] Segmented.module.css `.group` gets `flex-wrap: wrap;` (no other change).
  - [ ] Settings.test.tsx:
    - default render shows description "Slow pulse during a contraction · in 4 s, out 4 s" and radiogroups "Breathe in"/"Breathe out" with "4 s" checked
    - choosing "6 s" in Breathe in persists `breatheInSeconds: 6` (`await getSettings()`) and the description updates
    - switching the glow off removes both radiogroups and the description becomes "Slow pulse during a contraction"
    - with `matchMedia` stubbed to reduced motion, the help line shows and the radiogroups do not
  - [ ] e2e/settings.spec.ts: choose Breathe out "3 s" and Breathe in "7 s" → `readDb(page).settings` has `breatheInSeconds: 7, breatheOutSeconds: 3`. At 195 × 422 viewport on Settings, `scrollWidth <= clientWidth`. The existing "Breathing glow off hides the breathing caption on Live" test still passes.
  - [ ] e2e/quality/a11y-semantics.spec.ts still passes; update any counts of radios/radiogroups on Settings if it asserts them.
  - [ ] `npm run lint && npm run typecheck` clean, `npm test` green, the touched e2e specs green.
- Validation: `npm run lint && npm run typecheck && npm test && CI=1 npm run e2e -- e2e/settings.spec.ts e2e/quality/a11y-semantics.spec.ts e2e/quality/axe.spec.ts e2e/quality/copy.spec.ts`
- Notes for implementer:
  - Current switch block is in src/screens/Settings/index.tsx around line 110. The help pattern is the `isWakeLockSupported()` branch above it, using `styles.help` (Settings.module.css: `.help { margin: 0 0 var(--space-3); font-size: var(--fs-caption); … color: var(--text-muted) }`).
  - Add a `.timing` class (e.g. `display: flex; flex-direction: column; gap: var(--space-2); padding-bottom: var(--space-3);`) and a `.timingLabel` (`font-size: var(--fs-caption); font-weight: 800; color: var(--text-muted);`). Tokens only, no colour literals.
  - The visible label text must equal the radiogroup's accessible name (label-in-name).
  - `Segmented` options use `flex: 1` with min-content minimums, so `flex-wrap: wrap` only wraps when they don't fit. At 390 px all six fit on one line.
  - Copy: the "·" is U+00B7 with a space each side. "s" is lowercase. No exclamation marks.
  - Do not touch Live or HeroButton files (Task 2).

### Task 4: Update the binding spec text for the new glow and settings
- Type: code
- Goal: Bring docs/implementation-spec.txt in line with the new glow, Settings controls and data model.
- Owns: docs/implementation-spec.txt
- Depends on: none
- Acceptance criteria:
  - [ ] The motion line (around line 351, "Breathing glow: an 8 s ease-in-out loop that scales 0.94 → 1.04 at 35 → 90 % opacity …") is replaced, keeping the surrounding indentation, with: "Breathing glow: a soft peach disc behind the contraction button that grows from 0.7 × to 1 × of 420 px (1.4 × the button; clipped by the screen, and by the left column in landscape) at 40 → 90 % opacity as you breathe in, then shrinks and fades as you breathe out. Breathe in and Breathe out are set separately in Settings (3–8 s each, default 4 s + 4 s, an 8 s cycle). Ease-in-out, centred, starting on the inhale; a timing change applies from the next contraction. The glow sits under the other content and never takes taps. It is disabled under prefers-reduced-motion and by the Settings toggle."
  - [ ] SE-03 (around line 774) reads: "SE-03 Toggles: Keep screen awake, Gentle buzz and Breathing glow, all on by default. While Breathing glow is on, Breathe in and Breathe out sit under it (3–8 s each in 1 s steps, default 4 s) and its description shows the timing, e.g. "Slow pulse during a contraction · in 4 s, out 4 s". Under reduced motion the pickers are hidden and a help line reads "Your phone is set to reduce motion, so the glow stays off"."
  - [ ] Data model `settings` row (around line 395) lists `breatheInSeconds , breatheOutSeconds` after `breathingGlow ,`, with a note "(3–8, default 4; backups without them restore with 4)".
  - [ ] Decisions table "Breathing visual" (around line 1127) reads: "Yes, as the breathing glow behind the contraction button (4 s in, 4 s out by default, adjustable in Settings); on by default, off under reduced motion".
  - [ ] No other lines change. The battery line about "the optional glow, which uses CSS only and pauses when hidden" stays as is. `git diff --stat` shows only this file.
- Validation: `git diff docs/implementation-spec.txt` reviewed; `grep -n "0.94 → 1.04\|8 s glow" docs/implementation-spec.txt` returns nothing.
- Notes for implementer: The file is a text extraction of a PDF with fixed-width column layout. Keep the existing indentation and wrap long sentences onto continuation lines at the same indent, as neighbouring lines do. Do not edit docs/implementation-spec.pdf.
