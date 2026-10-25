/** Haptics fire only when the setting is on and the browser supports them; absence is silent by design (LT-16). */
function buzz(pattern: number | number[], enabled: boolean): void {
  if (!enabled || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(pattern);
}

export const hapticStart = (enabled: boolean): void => buzz(15, enabled);
export const hapticStop = (enabled: boolean): void => buzz([10, 60, 10], enabled);
