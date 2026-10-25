# Contraction Tracker — Design Brief

Oct 25, 2026 · @Marco

## Overview

The app is an offline-first progressive web app (PWA) for timing contractions. You log each contraction with one tap, rate its intensity, and the app works out intervals, durations and trends. It shows whether the pattern is regular and progressing.

Tracking is organised into **sessions**. A session starts when you begin tracking and ends when you stop. Past sessions stay saved, so days later you can open one, see its pattern, or compare it with another.

The app is installed to the phone's home screen. It works with no network connection, and all data stays on the device.

The app records and summarises. It never diagnoses, and it never tells the user they are or are not in labour.

## Users and context of use

The app has two users, and it is often used in poor conditions.

| User | What they do | What they need |
| --- | --- | --- |
| Labouring person | Taps start/stop, sometimes rates intensity | One hand, minimal reading, no thinking during a contraction |
| Birth partner | Usually runs the app, adds notes, reads numbers out to the midwife | Glanceable summary, fast editing, easy sharing |

Assume the following conditions:

- It's night: a dark room, a tired user, a phone held at arm's length.
- The user is distracted, in pain, or using one hand.
- The phone is handed back and forth between the two users.
- Sessions can run for many hours, with the screen left on.
- The user may be on the phone to a midwife or triage line, reading figures aloud.

## Design principles

1. **One big target.** The main start/stop button fills most of the screen and can be hit without looking.
2. **Calm, dark by default.** Use low-glare colours and no bright white, flashing or alarming red. Light mode is optional.
3. **Glanceable numbers.** Show the last interval, the last duration and the current state in large type, readable from 1 m away.
4. **Forgiving.** Any action can be undone in one tap. Every entry can be edited later. Nothing is lost if the phone locks or closes.
5. **No jargon, no verdicts.** Describe what happened ("every 4 min for the last hour"), never what it means medically.
6. **Two depths.** The live view is minimal. Analysis, charts and history sit one step away, never on the live screen.

## Core concepts and data model

The app stores raw timestamps and derives every other figure from them.

| Entity | Fields | Notes |
| --- | --- | --- |
| Session | id, name (optional), started at, ended at, notes | The user can rename it, e.g. "Tuesday evening". Only one session is active at a time. |
| Contraction | id, session id, start time, end time, intensity (1–10, optional), note | Intensity can be added during or after a contraction. |
| Event | id, session id, time, type, details | Types: waters broke (with colour), bleeding, reduced baby movement, called midwife, went to hospital, free note (e.g. "had a bath") |
| Settings | alert thresholds, intensity scale style, theme, units | Stored locally. |

**Derived metrics** (computed, never stored):

- **Duration** = end − start of one contraction.
- **Interval (frequency)** = the start of one contraction to the start of the next. This is the clinical convention, and the UI labels it "time apart".
- **Rest** = the end of one contraction to the start of the next. This is secondary and shown only in detail views.
- **Contractions per 10 minutes** over a rolling window.

## Screens and features

The app has six screens. The live tracker is the default whenever a session is active.

### 1. Live tracker (default during a session)

- A full-width start/stop button. Its state is obvious from colour, label and a large running timer.
- During a contraction: an elapsed-time counter, and optionally a soft visual pulse.
- After a contraction ends: an inline intensity picker (1–10, or a 5-step face scale). It can be skipped and auto-dismisses after about 30 s.
- Header stats: last interval, last duration, and averages over the last 30 and 60 min.
- A strip of the most recent contractions, shown as a mini timeline.
- Quick actions: Undo, Add event (waters, bleeding, note…), Share summary.
- A threshold banner that appears only when the user's own alert thresholds are met (see Pattern recognition).
- An End session control. It needs confirmation and must be hard to hit by accident.

### 2. Start screen (no active session)

- A Start new session button.
- A card for the last session, showing date, length, contraction count and a sparkline.
- An entry point to History.

### 3. History

- Sessions listed newest first. Each card shows date, start–end, length, contraction count, average interval, average duration and a mini timeline.
- Multi-select to compare sessions.

### 4. Session detail

- A summary block: totals, averages, and a regularity and progression readout.
- The charts listed in the Charts section.
- A full table of contractions and events, each editable. Users can add a missed contraction with manual times, or delete one.
- Rename the session and add notes.
- Export.

### 5. Compare sessions

- Two or three sessions overlaid or side by side, aligned on time since each session's start.
- A key-metrics table next to them.

### 6. Settings

- Alert thresholds, with presets plus custom values.
- Intensity scale style.
- Theme.
- Keep screen awake (on by default).
- Data: export all, import a backup, delete all.

### Sharing and export

- **Share summary**: a one-paragraph text the user can paste into a message or read aloud. Example: "Last hour: 14 contractions, every 3.5 min, lasting about 60 s, intensity about 7/10. Waters broke 14:20, clear."
- **Export session**: a PDF report with charts and the table, plus a CSV of raw data.
- **Backup**: a full JSON export and import, since data lives only on the device.

## Pattern recognition

The app describes the pattern in plain words and leaves interpretation to the user and their midwife.

| Signal | How it's computed | How it's shown |
| --- | --- | --- |
| Rolling averages | Mean interval, duration and intensity over the last 30 and 60 min | Header stats and the session summary |
| Frequency | Contractions per 10 min, rolling | "3 in the last 10 min" |
| Regularity | Coefficient of variation of intervals over the last hour | A three-level label: Irregular, Fairly regular, Regular. Example: "every 4–6 min" vs "every 2–12 min" |
| Progression | Trend (slope) of interval, duration and intensity across the session | Arrows or a short phrase: "getting closer together", "getting longer", "steady", "easing off" |
| Pattern type | Combines regularity and progression | A neutral description, e.g. "Irregular and not progressing" or "Regular and progressing". No medical labels such as "Braxton Hicks" or "active labour". |
| Gaps | A pause well above the recent average interval | Marked on the timeline. The live screen may ask "Contractions paused?" |
| User thresholds | Rules the user sets, e.g. "3 in 10 min" or "5-1-1" (5 min apart, 1 min long, for 1 hour) | A calm banner when met: "Matches the threshold you set: 3 in 10 min." The wording points back to the user's own plan. |

Thresholds ship with presets but no default is switched on. Guidance differs between first and later births and between maternity units, so the user picks what they've been told.

## Charts and visualisations

The timeline is the hero chart, and every other chart supports it.

| Chart | Where | Encoding | Purpose |
| --- | --- | --- | --- |
| Contraction timeline | Live (mini), session detail (full) | Time on x. Each contraction is a bar: width = duration, height or colour = intensity. Events are marker icons. Gaps are visibly empty. | See the whole pattern at a glance |
| Interval trend | Session detail | Line of each interval, with a rolling-average line overlaid | Are they getting closer together? |
| Duration trend | Session detail | The same as interval trend, for duration | Are they getting longer? |
| Intensity trend | Session detail | Points plus a rolling average | Are they getting stronger? |
| Frequency per 10 min | Session detail | Stepped line or bars per 10-min bucket | Matches how midwives ask |
| Session comparison | Compare | Timelines stacked and aligned at t=0, plus overlaid interval trends | How did Tuesday differ from tonight? |
| History sparklines | History cards | A tiny timeline per session | Quick recognition in the list |

All charts need:

- Pinch-zoom and pan on the time axis, with sensible presets (last 1 h, last 3 h, whole session).
- A tap on any bar or point to show its exact times, plus edit.
- Colours that work in dark mode and for colour-blind users. Intensity can never be shown by colour alone.

## Technical constraints for design

- **The PWA is installed to the home screen** and must work fully offline from first load. There are no accounts and no network calls.
- **Storage is local (IndexedDB).** Design should make backup and export easy to find, because clearing browser data loses everything.
- **The screen stays awake.** The Wake Lock API keeps it on during a session. Show a small indicator when it is active.
- **The app survives being closed.** State is rebuilt from stored timestamps on reopen. An in-progress contraction resumes with the correct elapsed time.
- **Notifications are limited.** Background alerts on iOS PWAs are unreliable, so threshold alerts are in-app banners. Don't design flows that depend on push.
- **Target devices are phones first, portrait.** Minimum width is 320 px. Touch targets are at least 48 px, and the main button is far larger. Tablets and desktops get a wider history and detail layout.
- **Accessibility:** WCAG AA contrast, screen-reader labels, support for reduced motion, and optional haptic feedback on start and stop.

## Scope, tone and open questions

**Out of scope for v1:**

- Accounts and cloud sync
- Clinical advice or diagnosis
- Pregnancy tracking beyond contractions
- Kick counting
- Hospital bag lists

**Tone and safety wording.** Be warm, plain and brief. The app has a persistent but unobtrusive line in settings and on first launch: "This app records contractions. It doesn't give medical advice — if you're worried, contact your midwife or maternity unit." Events such as bleeding or reduced movements get a gentle prompt: "If you haven't already, contact your midwife or maternity unit." The prompt carries no alarm styling and no countdowns.

**Open questions:**

- [ ] Partner sync: is one device enough for v1? The layout should leave room for a future "shared session" indicator.
- [ ] Intensity scale: numeric 1–10 or a 5-step descriptive scale (or both)?
- [ ] Should the live screen offer a breathing-pace visual during contractions, or is that clutter?
- [ ] Name and visual identity.
