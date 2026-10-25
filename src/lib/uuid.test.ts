import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from './uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns an RFC 4122 v4 UUID', () => {
    expect(newId()).toMatch(V4);
  });

  it('works when crypto.randomUUID is unavailable (insecure origin)', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    expect((globalThis.crypto as { randomUUID?: unknown }).randomUUID).toBeUndefined();
    for (let i = 0; i < 50; i++) expect(newId()).toMatch(V4);
  });

  it('sets the version and variant bits on the fallback path', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (a: Uint8Array) => {
        a.fill(0xff);
        return a;
      },
    });
    expect(newId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    vi.stubGlobal('crypto', {
      getRandomValues: (a: Uint8Array) => {
        a.fill(0);
        return a;
      },
    });
    expect(newId()).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('is unique over a few thousand ids, on both paths', () => {
    const native = new Set(Array.from({ length: 3000 }, newId));
    expect(native.size).toBe(3000);
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    const fallback = new Set(Array.from({ length: 3000 }, newId));
    expect(fallback.size).toBe(3000);
  });
});
