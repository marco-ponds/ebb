# Breathing glow: configurable timing and a larger, more visible visual

Requested by the human (2026-10-26), verbatim: "i need the timing of the breathing for the timer to be configurable, and i want the visual of it to be much larger and visible."

## Context (current behaviour, from the v1 spec and code)
- During a contraction, Live shows a 300 px peach circle (the hero button). Behind it, a breathing glow runs when Settings → "Breathing glow" is on and prefers-reduced-motion is off.
- Spec (docs/implementation-spec.txt, "Shape, spacing and motion"): "Breathing glow: an 8 s ease-in-out loop that scales 0.94 → 1.04 at 35 → 90 % opacity behind the contraction button. It is disabled under prefers-reduced-motion and by the Settings toggle."
- A caption shows under the button while the glow is on: "Breathe with the glow — in as it grows, out as it fades".
- Code: src/components/HeroButton/HeroButton.tsx + HeroButton.module.css (.glow, @keyframes breathe, var(--glow-duration) = 8s in src/styles/tokens.css); setting `breathingGlow: boolean` in src/db/types.ts / defaults.ts, toggled in src/screens/Settings/index.tsx; Live wiring in src/screens/Live/LiveHero.tsx / index.tsx.
- Hard constraints still apply: no flashing, no bounces/shakes, calm pastel palette, no red; CSS-only animation that pauses when hidden; disabled under reduced motion; battery budget (no animation besides the 1 Hz timer and the glow); WCAG AA; the button must remain a single big tap target.

## What changes
1. The breathing timing becomes user-configurable in Settings (today it is fixed at 8 s per cycle).
2. The breathing visual becomes much larger and more visible than the current subtle 0.94 → 1.04 scale glow behind the 300 px circle.
