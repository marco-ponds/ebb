import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startContraction } from '../../db/contractions';
import { startSession } from '../../db/sessions';
import { dropDb, freshDb } from '../../db/testDb';
import { getDb } from '../../db/schema';
import { DIDNT_APPLY, useContractionToggle } from './useContractionToggle';

beforeEach(freshDb);
afterEach(dropDb);

describe('useContractionToggle refusals', () => {
  it('turns a rejected start into quiet feedback, with no unhandled rejection and no extra row', async () => {
    const s = await startSession(1000);
    await startContraction(s.id, 2000); // "another window" already started one
    const { result } = renderHook(() => useContractionToggle(s.id, null, false));
    act(() => result.current.toggle());
    await waitFor(() => expect(result.current.problem).toBe(DIDNT_APPLY));
    expect(await getDb().contractions.count()).toBe(1);
    expect(result.current.announcement).toBe('');
    act(() => result.current.clearProblem());
    expect(result.current.problem).toBeNull();
  });

  it('turns a rejected stop (already stopped elsewhere) into the same feedback', async () => {
    const s = await startSession(1000);
    const c = await startContraction(s.id, 2000);
    const stale = { ...c, endAt: null };
    await getDb().contractions.put({ ...c, endAt: 3000 });
    const { result } = renderHook(() => useContractionToggle(s.id, stale, false));
    act(() => result.current.toggle());
    await waitFor(() => expect(result.current.problem).toBe(DIDNT_APPLY));
    expect((await getDb().contractions.get(c.id))?.endAt).toBe(3000);
  });
});
