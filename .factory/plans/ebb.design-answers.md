# Design review answers (human, 2026-10-25) — authoritative

1. Navigation during an active session: a small menu/settings icon button in the Live header (same
   style as Start's icon button) leads to Settings and History. `#/` redirects to `#/live` while a
   session is active. Back on History and Settings returns to Live when a session is active.
2. Undo on Session detail: deletes and edits show a toast "Deleted · Undo" / "Saved · Undo" for ~5 s,
   sharing the same depth-1 undo slot as Live's Undo.
3. Event save: the Event sheet switches to a confirmation state ("Saved · Waters broke, green or
   brown, 23:30"), shows the gentle prompt below it when applicable, has a Done button and closes only
   when tapped. The prompt sits in a role="status" region.

# Suggestions folded in (all chosen)
- Accessibility: HoldToConfirm also works by holding Space/Enter; assistive-technology activation
  (e.g. VoiceOver double-tap / click without hold) opens the "End this session?" sheet directly (the
  sheet is the second confirmation). Delete is also available inside the row edit sheet (swipe is not
  the only way). The strength picker's 30 s auto-dismiss pauses while focus is inside it. Undo has a
  disabled state (aria-disabled) when there is nothing to undo.
- Copy consistency: use "Lasting" everywhere (not "Last lasted"). The breathing caption ("Breathe with
  the glow — in as it grows, out as it fades") is hidden when Breathing glow is off or
  prefers-reduced-motion is set. Threshold banner uses the spec template "Matches the threshold you
  set — {name}" ({name} = custom label if set, else the threshold name); the screenshot's
  "from your plan with the midwife" wording is a mock-up artefact. Strength is shown in the
  Settings-chosen format (word / number / both) in the log and compare tables. The "1m 02s" in the
  strength-picker header is the length of the contraction that just ended.
- Custom threshold editor: fields = type (N in M minutes | A-L-D), the values, optional label (used in
  the banner); custom thresholds can be edited and deleted; inputs validated (positive numbers, sane
  ranges; save disabled with inline hint when invalid).
- Safe Restore → Replace: take an automatic JSON snapshot (backups cache) before Replace, show a
  confirmation line, and Restore is disabled during an active session (with a hint why).
