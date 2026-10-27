# Breathing glow — factory rulings and deferred findings

Decisions the coordinator made on the human's behalf (2026-10-27), in order.

## Rulings
- Task 2: Ruling: Task 2 makes src/screens/Live/Live.test.tsx deterministic (fixed fake time) — it is in Task 2's Owns and fails before this feature depending on wall-clock time — if wrong, nothing.
- Wave 1: integration on 906a3a0 — lint/typecheck/build clean, e2e 576 + 4 skips; unit 671 pass, 1 fail = pre-existing time-of-day flake in Live.test.tsx (fails on main too, 10:57 'This morning' vs 'Tonight'). Ruling: proceed to wave 2; Task 2 fixes it (in its Owns) — if wrong, one red test until Task 2 merges.
- Wave 2: Ruling: Segmented options get min-width: var(--touch-min) (flex-wrap already on, so they wrap rather than shrink); integration fix also adds a landscape contracting check that the glow adds no vertical scroll — touch-target rule is binding — if wrong, pickers wrap to 2 rows on narrow cards.
- Final: Ruling: fix wave = I1 (timing pickers as an even 3-column grid, scoped to the timing groups) + I2 (shared Segmented option back to content-based sizing: flex: 1 0 auto + min-width touch-min) + M1/M2 (pause glow at peak in pointer-events and sideways tests so they can fail) + M3 (short CSS opacity fade-out of the glow when a contraction ends, ≈220 ms, no flash) + M4/M5 + Task 4 '0.7' wrap (spec text: halo line gradient exception; "applies from the next contraction or when you return to Live") + M7 (aria-labelledby for timing labels) — all cheap, user-visible or test-strength — if wrong, small diff to revert.
- Final: Ruling: M6 (straight clip edge at peak) left as is — within the human's "clipped by the screen", taste call — if wrong, a gradient stop tweak.

## Deferred minor findings
- Task 4: minor (deferred): motion line wrap splits '0.7' from '×'
- Task 1: minor (deferred): reads.ts import order; withSettingsDefaults lets explicit undefined override (unreachable via JSON)
- Task 3: minor (deferred): settings e2e 195px check measures right after setViewportSize; weak getAllByText assertion
- Task 2: minor (deferred): dimmed StatCard border/shadow stays full opacity (check light theme); ensureBreatheKeyframes has no NaN guard
- Wave 2: minor (deferred): landscape glow test samples duration/2, assumes default 4/4 timing and no delay; no red check run
- Final: minor (deferred): GLOW_FADE_MS JS constant synced to --dur-crossfade only by comment; leaving glow uses data-glow-leaving
