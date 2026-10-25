import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText, saveFile } from './share';

const blob = new Blob(['hi'], { type: 'text/plain' });

describe('saveFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('downloads through an anchor by default', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await expect(saveFile(blob, 'a.csv')).resolves.toBe('downloaded');
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('shares files in iOS standalone mode when canShare allows it', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      share,
      canShare: () => true,
      standalone: true,
    });
    await expect(saveFile(blob, 'a.csv')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0][0].files[0].name).toBe('a.csv');
  });

  it('downloads on iOS when not standalone', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('navigator', {
      userAgent: 'iPhone',
      share: vi.fn(),
      canShare: () => true,
      standalone: false,
    });
    await expect(saveFile(blob, 'a.csv')).resolves.toBe('downloaded');
  });
});

describe('copyText', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resolves true when the clipboard accepts the text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(copyText('x')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('x');
  });

  it('resolves false when the clipboard is missing or rejects', async () => {
    vi.stubGlobal('navigator', {});
    await expect(copyText('x')).resolves.toBe(false);
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new Error('no')) } });
    await expect(copyText('x')).resolves.toBe(false);
  });
});
