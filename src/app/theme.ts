import { useLayoutEffect } from 'react';
import { useSettings } from '../state/hooks';

/** Mirrors settings.theme (night | day | system) onto <html data-theme>; tokens.css does the rest. */
export function useApplyTheme(): void {
  const { theme } = useSettings();
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}
