import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '../components/Toast/toastStore';
import { undoWithFeedback, DIDNT_SAVE } from './undoFeedback';

const undoLast = vi.hoisted(() => vi.fn());
vi.mock('../db/undo', () => ({ undoLast }));

const message = () => useToastStore.getState().toast?.message;

describe('undoWithFeedback', () => {
  beforeEach(() => {
    useToastStore.getState().dismissToast();
    undoLast.mockReset();
  });
  it('confirms with "Undone"', async () => {
    undoLast.mockResolvedValue('edit');
    await undoWithFeedback();
    expect(message()).toBe('Undone');
  });
  it('stays quiet when there was nothing to undo', async () => {
    undoLast.mockResolvedValue(null);
    await undoWithFeedback();
    expect(message()).toBeUndefined();
  });
  it('shows the quiet failure line and does not throw when the undo is refused', async () => {
    undoLast.mockRejectedValue(new Error('disk full'));
    await expect(undoWithFeedback()).resolves.toBeUndefined();
    expect(message()).toBe(DIDNT_SAVE);
  });
});
