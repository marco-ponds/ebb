/** The glow's keyframes for a given in/out split. CSS keyframe selectors cannot use var(), so the rule is generated. */
export function breatheKeyframes(inS: number, outS: number): { name: string; css: string } {
  const name = `breathe-${inS}-${outS}`;
  const peak = Number(((inS / (inS + outS)) * 100).toFixed(3));
  const css = `@keyframes ${name} { 0%, 100% { transform: scale(0.7); opacity: 0.4; } ${peak}% { transform: scale(1); opacity: 0.9; } }`;
  return { name, css };
}

/** Adds the rule once per name to a single `<style data-ebb-breathe>` in the head, and returns the name. */
export function ensureBreatheKeyframes(inS: number, outS: number): string {
  const { name, css } = breatheKeyframes(inS, outS);
  let el = document.head.querySelector<HTMLStyleElement>('style[data-ebb-breathe]');
  if (!el) {
    el = document.createElement('style');
    el.setAttribute('data-ebb-breathe', '');
    document.head.appendChild(el);
  }
  if (!(el.textContent ?? '').includes(`@keyframes ${name} `)) {
    el.appendChild(document.createTextNode(`${css}\n`));
  }
  return name;
}
