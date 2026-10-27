# Design review answers (human, 2026-10-26) — authoritative

1. Timing: SEPARATE breathe-in and breathe-out durations (two controls), no hold. (The design critic suggested 3–8 s each as an example range; range, step, control type and default are not fixed by the human — the default must reproduce today's 8 s cycle, i.e. 4 s in + 4 s out.)
2. Size: big glow behind content — the glow grows well past the 300 px circle (about 1.4×, near screen width), soft peach at higher opacity, sits UNDER the other content (cards, caption, action row), which stays opaque/legible with AA contrast. The glow is decorative and never interactive (pointer-events: none) so the tap target stays exactly the 300 px circle; its smallest size stays at or below the button edge so "in as it grows" still reads; no new colour; clipped by the screen (no horizontal scroll); in landscape bounded by the left hero column.

# Suggestions folded in (human chose)
- Smarter Settings control: the timing controls sit directly under the "Breathing glow" switch and are hidden when the glow is off; under prefers-reduced-motion show a help line under the switch ("Your phone is set to reduce motion, so the glow stays off"), reusing the existing help-line pattern used under "Keep screen awake"; the switch description reflects the chosen timing (e.g. "Slow pulse during a contraction · in 4 s, out 4 s").
- Calm-motion rules: each contraction starts on the inhale (smallest, faintest frame); a timing change applies from the next cycle/contraction, never jumping mid-breath; centred grow/fade only, ease-in-out, no translation, no overshoot, no blur flicker.
- Update the binding spec in the same change: docs/implementation-spec.txt motion line ("8 s ... 0.94 → 1.04"), SE-03 (new controls + defaults), the data model Settings list (new fields, with defaults so older backups restore cleanly), and the decisions table entry about "the 8 s glow".

# Not folded in
- Live breathing preview dot in Settings (declined).
