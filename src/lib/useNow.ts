import { useEffect, useState } from 'react';

/** Current time in epoch ms. Re-renders at most once per second, on the whole-second boundary. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let raf = 0;
    let lastSecond = Math.floor(Date.now() / 1000);

    const tick = () => {
      const t = Date.now();
      const s = Math.floor(t / 1000);
      if (s !== lastSecond) {
        lastSecond = s;
        setNow(t);
      }
      raf = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (document.hidden) return;
      const t = Date.now();
      lastSecond = Math.floor(t / 1000);
      setNow(t);
      raf = requestAnimationFrame(tick);
    };

    if (!document.hidden) raf = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return now;
}
