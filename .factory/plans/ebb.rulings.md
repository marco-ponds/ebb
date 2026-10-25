# Ebb v1 — factory rulings and deferred findings

Every decision the coordinator made on the human's behalf during the build (2026-10-25), in order, with what it costs if wrong. Generated from the run ledger.

## Rulings

- Ruling: CONFLICT-1 — Task 6 and Task 7 E2E specs seed data with e2e/helpers/db.ts (onboard + seedDb) and navigate straight to #/live, #/history, #/compare; they must not depend on Start/Welcome UI, ToastHost or route guards from Task 5 — parallel wave isolation — if wrong, small E2E rework at wave-3 integration.
- Ruling: CONFLICT-2 — Task 10's settings.spec verifies the scale change via the stored setting (readDb) instead of Live's picker; Task 11 adds the cross-check that Live's picker follows the setting — Task 8 is parallel in wave 4 — if wrong, one assertion moves.
- Ruling: CONFLICT-3 — accept the private overlap check in src/db (same rule as domain findOverlap) — removes a cross-wave dependency, ~10 lines — if wrong, a later dedupe refactor.
- Ruling: CONFLICT-4 — Task 4 does not import axe-core in Vitest (transitive deps are not to be relied on); it uses Testing Library role/name assertions; axe coverage is Task 11's Playwright axe spec — no dependency changes allowed after Task 1 — if wrong, a11y defects in components surface at Task 11 instead of Task 4.
- Ruling: CONFLICT-5 — Task 11 may edit README.md (audit section only) — documentation only — negligible.
- Task 1: Ruling: prefers-contrast: more raises --text-muted to #D6D0E8 only in the Night palette (spec value is for Dusk); Day and system-light get their own darker high-contrast muted (#3A3450 or similar ≥7:1) — spec intent is "raise contrast", the Day theme is planner-derived — if wrong, one token value changes.
- Wave 1: Ruling: task worktrees live outside the repo at ~/dev/personal/ebb-worktrees/ — nested .claude/worktrees made 'eslint .' lint a worktree's dist (1064 errors) — if wrong, nothing (location only)
- Task 2: Ruling: "Only 1–3 contractions → stats show —" vs "rolling averages show — until ≥ 2 intervals" — domain keeps the formulas (lastStats non-null when known, rolling needs ≥ 2 intervals); screens apply the edge row: averages card shows "Not enough yet" and pattern line hidden while counted contractions < 4; the per-card last-one stats follow LT-05 ("— when unknown") — edge row is the more specific required behaviour for averages, LT-05 governs the last-one cards — if wrong, one condition in Live/Detail.
- Task 2: Ruling: displayName's relative name ("Tonight"/"This morning"/"This afternoon") for an active unnamed session uses partOfDay(now) — brief silent; the label describes the present — if wrong, one argument changes.
- Task 2: Ruling: A-L-D ignores the interval whose previous contraction lies before the window, needs ≥ max(D×60/A − 1, 1) — reasonable reading of "across the last D hours" — if wrong, threshold fires one contraction earlier/later.
- Task 2: Ruling: ⚠️ progression needs ≥ 5 points per metric series (interval series → 6 contractions) — literal reading of "at least 5 points" — if wrong, interval arrow appears one contraction earlier.
- Task 2: Ruling: ⚠️ regularity CV uses sample SD (d3 deviation) — spec silent; standard for small samples — if wrong, labels near cut-offs shift slightly.
- Task 3: Ruling: on a replay conflict, the conflicted set AND every later pending set move to conflicts (they were planned against the conflicted overlay) — simplest correct rule; parked sets are rare (storage failure) — if wrong, some valid later taps get reported as conflicts instead of replayed.
- Wave 2: integration RED — store.test.ts p95 benchmark 83 ms > 50 under full parallel suite (passes alone, 13/13). Ruling: keep the fake-indexeddb benchmark but add 10 warm-up runs and { retry: 2 } on timing-only tests; the binding DB-commit p95 < 50 ms budget is measured in-browser by Task 11's perf spec — fake-indexeddb under parallel jsdom load isn't a valid budget gate — if wrong, a real regression could slip until Task 11.
- Task 6: Ruling: replay conflicts (storage.conflictCount > 0) are shown on Live as a quiet card 'A few taps couldn't be saved because this session changed in another window.' with an OK button → clearConflicts() — Task 3 surfaced them, Live owns storage cards — if wrong, copy tweak.
- Task 7: Ruling: accept the src/app/App.test.tsx heading edit outside Owns (placeholder 'History' → 'Sessions') — test-only, any conflict with Task 5 is mechanical — if wrong, trivial.
- Task 7: Ruling: Task 7 may edit src/charts/** for this fix (add a relative time mode to Timeline/TrendChart tooltips + axis) — no other wave-3 task modifies src/charts — if wrong, a merge conflict with Task 6 that is mechanical.
- Task 5: Ruling: exportBackup(now) no longer writes lastBackupAt; new export markBackupDone(now) in src/db/backup.ts sets it; callers call it only after saveFile resolves — Task 5 may edit src/db/backup.ts(+test) for this; Task 10 (Settings) must use the same pair — if wrong, small API churn.
- Task 5: Ruling: remove the 2 s wait; the #/live guard in App.tsx, when the store shows no active session, confirms with a direct DB read (findActiveSession) before redirecting to #/ — fixes the race for every entry to Live — if wrong, a brief extra DB read on #/live.
- Wave 3: Ruling: in parallel worktrees run e2e as CI=1 npm run e2e (reuseExistingServer is !CI, so a local run can silently test another worktree's preview server on :4173); a port clash then fails loudly — retry when free. Task 11 may make the port configurable — if wrong, slower serial e2e runs.
- Task 6: Ruling: banner dismissal is per threshold id; when the first met threshold is dismissed, the next met one (list order) shows — dismissing one of the user's rules shouldn't hide a different rule — if wrong, a one-line change.
- Wave 3: Ruling: route-level code splitting — History, Compare, SessionDetail and Settings screens load via React.lazy in App.tsx (Suspense fallback = Skeleton); Live, Start, Welcome stay in the entry graph — 109.1/120 kB before wave 4 adds detail + settings; the budget applies to the static entry graph, and lazy chunks are still precached for offline — if wrong, first open of a secondary screen pays one chunk load from the SW cache.
- Task 10: Ruling: a custom threshold the user creates starts enabled ("no default switched on" governs shipped presets) — creating one is an explicit choice — if wrong, one default flips.
- Task 10: Ruling: custom threshold editing via a pencil "Edit {name}" button instead of row tap (the Switch fills the row) — avoids gesture clash — if wrong, layout tweak.
- Task 8: Ruling: the strength card opens from the stop tap's resolution in this view (useContractionToggle's stop success carries the stopped contraction id/duration to the rating slot), not from store transitions or time — LT-08 "when a contraction ends" = the user's stop here — if wrong, a stop from another tab wouldn't prompt a rating here (acceptable).
- Task 9: Ruling: Task 9 may edit src/charts/** to let Timeline and TrendChart tooltips take extra caller-supplied lines (optional prop, default behaviour unchanged) — Task 8 (parallel) doesn't touch src/charts — if wrong, mechanical merge.
- Task 11: Ruling: --text-faint changed from the spec's #8C85A8 to #9A93B6 — #8C85A8 fails the spec's own "all text ≥ 4.5:1" rule on --surface (4.42:1) and --surface-2 (3.89:1); the a11y rule outranks the hex value — if wrong, captions are a shade lighter than the drawn design.
- Task 11: Ruling: dimmed (55 %) contracting-state regions use full --text so dimmed text stays ≥ 4.5:1 — spec requires both the dim and 4.5:1 — if wrong, dimmed text slightly brighter than drawn.
- Task 11: Ruling: accept .lighthouseci/ added to .gitignore outside Owns — trivial — negligible.
- Final: Ruling: fix wave includes I1–I3, discardContraction guard, security Low (CSV formula injection), failing-status-after-conflict, PDF notes wrap, M6 (detail toast Undo uses Live's handler), M9 (restore snapshot line only when saved) — all cheap and user-visible — if wrong, slightly larger fix diff.
- Final: Ruling: remaining final-review minors (M1 tooltip interval vs counted dots, M2 TimeField seconds, M3 threshold eval only on Live, M4 History/Compare overlay, M5 add-missed bounds, M7 delete in-progress row, M8 iOS PDF share activation, M10 dead domain code) stay deferred; M8 added to the Task 12 device checklist — rare paths or cosmetic — if wrong, follow-up issues.
- Final: parked — Share text averages not ENOUGH-gated (with 1–3 contractions Share prints "every X" while other screens show "—") — Ruling: real, non-blocking follow-up; the count is printed first and the figures match the other screens' math — if wrong, a midwife hears an average from 2–3 contractions.

## Parked

- Final: parked — Share text averages not ENOUGH-gated (with 1–3 contractions Share prints "every X" while other screens show "—") — Ruling: real, non-blocking follow-up; the count is printed first and the figures match the other screens' math — if wrong, a midwife hears an average from 2–3 contractions.

## Deferred minor findings (follow-ups)

- Task 1: minor (deferred): router parseHash decodeURIComponent throws URIError on malformed hash (no error boundary)
- Task 1: minor (deferred): tokens.css system-light block duplicates the day values verbatim; consider color-scheme declarations
- Task 1: minor (deferred): main.tsx boot() has no catch if getDb().open() rejects (Task 3 adds fallback)
- Task 1: minor (deferred): e2e/fixtures.ts `const base` shadows imported `base`
- Task 1: minor (deferred): e2e onboard() uses Node Date.now(), ignores page.clock
- Task 1: minor (deferred): vite.config runtimeCaching `url.pathname.length > 0` always true
- Task 1: minor (deferred): tsconfig redundant noUncheckedIndexedAccess:false
- Task 2: minor (deferred): thresholds.ts A-L-D gap check applies to first in-window row whose interval is otherwise ignored → a run restarting after a long silence can't be met until that row ages out
- Task 2: minor (deferred): metrics.ts duration progression drops the gap row's duration (spec only excludes gap intervals)
- Task 2: minor (deferred): metrics.test "Fairly regular" first assertions are weak
- Task 2: minor (deferred): format.test TZ restore could set "undefined"
- Task 2: minor (deferred): csv.ts no formula-injection neutralising for =,+,-,@ cells
- Task 3: minor (deferred): discardContraction doesn't check row exists/in progress
- Task 3: minor (deferred): emit() lets memory status mask failing → no Retry in memory mode
- Task 3: minor (deferred): parseBackup accepts duplicate ids in one file and doesn't range-check intensity
- Task 3: minor (deferred): stopContraction accepts now < startAt
- Task 3: minor (deferred): store.test "fallback cannot start" test name tests startSync throw; fallback-open failure untested
- Task 3: minor (deferred): liveQuery error handler marks store ready with null snapshot
- Task 3: minor (deferred): buildBackup reads 4 tables outside a transaction
- Task 3: minor (deferred): purgeExpired only runs at initStore
- Task 4: minor (deferred): pointer capture on zoomable svg may retarget bar taps on touch
- Task 4: minor (deferred): keyboard chart tooltips not announced (no aria-live/aria-describedby)
- Task 4: minor (deferred): pinch → one-finger lift re-bases from stale domain (small jump)
- Task 4: minor (deferred): DurationField can't be cleared to retype
- Task 4: minor (deferred): Timeline perf test best-of-3
- Task 4: minor (deferred): pointerPolyfill.ts test-only code in src/charts
- Task 4: minor (deferred): HoldToConfirm starts on right-click; ring rx 18 vs radius 20
- Task 4: minor (deferred): mini timeline marker kind colour-only
- Task 4: minor (deferred): Sheet document keydown listeners — two open sheets would both handle Esc/Tab (no nesting today)
- Task 4: minor (deferred): HoldToConfirm RADIUS hard-coded 20 (not read from --radius-button); 300x48 fallback first paint; restoreAllMocks not in afterEach
- Task 3: minor (deferred): reads outside the queue can see the running op's uncommitted writes (queue.ts intendedWrites includes global running.writes)
- Task 3: minor (deferred): op rejects instead of parking if a read fails after a failed write in the same op
- Task 3: minor (deferred): status stays 'failing' with 0 pending / 0 conflicts after a conflict (clearConflicts doesn't reset failing)
- Task 3: minor (deferred): after a conflict, a new tap on healthy storage is parked plan-only
- Task 3: minor (deferred): live undoLast doesn't re-check invariants against the DB (cross-tab undo could reopen a second contraction) — pre-existing
- Task 3: minor (deferred): replay full-row puts overwrite other tab's edits (last write wins)
- Task 7: minor (deferred): compare thead empty <td/> should be a th with sr-only label
- Task 7: minor (deferred): ROWS / MIN_COMPARED constants defined below use
- Task 7: minor (deferred): compare shows header-only while loading (skeleton rule)
- Task 7: minor (deferred): useMemo on ids may be ineffective if router returns fresh arrays
- Task 7: minor (deferred): history reads all contractions; per-session memo for 300+ rule
- Task 7: minor (deferred): compare tests only cover "Regular" pattern
- Task 5: minor (deferred): swUpdate updateSW(true) async window could reload a just-started session
- Task 5: minor (deferred): theme applies default (night) before store ready → Day users see a night frame at boot
- Task 5: minor (deferred): Start openedAt frozen at mount (relative day stale past midnight)
- Task 5: minor (deferred): BootFailed reuses StorageNotice.module.css; Wordmark/StorageNotice live in src/app
- Task 5: minor (deferred): LiveGuard findActiveSession() rejection → blank screen + unhandled rejection
- Task 5: minor (deferred): LiveGuard inDb=true can stick after session ends while store lagged
- Task 5: minor (deferred): markBackupDone failure shows "Couldn't save the backup" though file saved
- Task 6: minor (deferred): useWakeLock starts 'unavailable' → "Screen may sleep" flicker before the lock resolves / on hide
- Task 6: minor (deferred): EndSessionSheet count uses contractions.length (all non-deleted) — confirm intended
- Task 6: minor (deferred): toggle .catch shows "another window" text for any error incl. storage failure
- Wave 4: minor (deferred): store.test p95 benchmark still flaked 1/7 full runs despite warm-up+retry
- Task 10: minor (deferred): restore/deleteAll rejection feedback has no unit test
- Task 10: minor (deferred): delete-all while a session is active untested (relies on store clearing before Task 5 guard)
- Task 10: minor (deferred): threshold Delete uses rose destructive-text (tokens reserve rose for Delete all data)
- Task 10: minor (deferred): Replace equal weight to Merge, no in-app snapshot recovery
- Task 10: minor (deferred): .fileInput absolute without positioned ancestor (scroll jump on focus)
- Task 10: minor (deferred): DataSection openedAt frozen at mount; no size cap on restore file
- Task 8: minor (deferred): useRatingActive opens via effect → possible one-frame flash before picker
- Task 8: minor (deferred): Event Save uses disabled (not aria-disabled like Undo)
- Task 8: minor (deferred): no tests for picker focus-pause in Live and Tab after event confirmation swap
- Task 9: minor (deferred): Lasting column "64s" vs formatDuration "1m 04s" (matches screenshot; also PDF table)
- Task 9: minor (deferred): PDF table event notes not truncated
- Task 9: minor (deferred): patternEnough counts whole session vs regularity's final-hour window (harmless)
- Task 9: minor (deferred): no test presses "Saved · Undo"; swipe e2e uses mouse; LogTable JSX formatting
- Task 8: minor (deferred): "Ended earlier" stopContraction(...).then is void with no .catch (sheet stays open, unhandled rejection)
- Task 8: minor (deferred): DIDNT_SAVE constant lives in rating.ts (shared messages module would be tidier)
- Task 9: minor (deferred): edit sheet shows stored timing, not live as start/end are edited; in-progress row shows "—"
- Task 11: minor (deferred): performance.measure('ebb:db-commit') entries accumulate unbounded in production
- Task 11: minor (deferred): pan perf median limit 17 ms vs measured 16.7 ms (thin margin; pin serial if it flakes)
- Task 11: minor (deferred): copy spec checks safety line only on the "Start" state, not "Start, no sessions yet"
