import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../db/defaults';
import { useAppStore } from '../state/store';
import { useApplyTheme } from './theme';

function Probe() {
  useApplyTheme();
  return null;
}

describe('useApplyTheme', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.theme;
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, theme: 'night' } });
  });

  it('sets data-theme from settings.theme and follows changes', () => {
    render(<Probe />);
    expect(document.documentElement.dataset.theme).toBe('night');
    act(() => useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, theme: 'day' } }));
    expect(document.documentElement.dataset.theme).toBe('day');
    act(() => useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, theme: 'system' } }));
    expect(document.documentElement.dataset.theme).toBe('system');
  });
});
