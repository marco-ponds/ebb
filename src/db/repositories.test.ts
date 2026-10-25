import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addMissedContraction,
  deleteContraction,
  discardContraction,
  rateContraction,
  startContraction,
  stopContraction,
  updateContraction,
} from './contractions';
import { OverlapError } from './errors';
import { addEvent, deleteEvent, updateEvent } from './events';
import { getDb } from './schema';
import { endSession, markThresholdMet, renameSession, setSessionNotes, startSession } from './sessions';
import { getSettings, updateSettings } from './settings';
import { dropDb, freshDb } from './testDb';
import { purgeExpired, undoLast } from './undo';
import { DEFAULT_SETTINGS } from './defaults';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

beforeEach(freshDb);
afterEach(dropDb);

async function activeSession() {
  return startSession(T0);
}

describe('sessions', () => {
  it('throws on a second startSession while one is active', async () => {
    await startSession(T0);
    await expect(startSession(T0 + 1)).rejects.toThrow(/already active/);
    expect(await getDb().sessions.count()).toBe(1);
  });

  it('allows a new session after the first ended', async () => {
    const s = await startSession(T0);
    await endSession(s.id, T0 + MIN);
    await expect(startSession(T0 + 2 * MIN)).resolves.toMatchObject({ endedAt: null });
  });

  it('endSession closes an in-progress contraction at now and clears undo', async () => {
    const s = await activeSession();
    const c = await startContraction(s.id, T0 + MIN);
    expect(await getDb().undo.get('singleton')).toBeDefined();
    const ended = await endSession(s.id, T0 + 3 * MIN);
    expect(ended.endedAt).toBe(T0 + 3 * MIN);
    expect((await getDb().contractions.get(c.id))?.endAt).toBe(T0 + 3 * MIN);
    expect(await getDb().undo.get('singleton')).toBeUndefined();
  });

  it('startSession clears undo', async () => {
    const s = await startSession(T0);
    await endSession(s.id, T0 + MIN);
    await addEvent(s.id, { type: 'note', at: T0 }); // fills the slot on an ended session
    await startSession(T0 + 2 * MIN);
    expect(await undoLast()).toBeNull();
  });

  it('renames, sets notes and marks the threshold only once', async () => {
    const s = await activeSession();
    expect((await renameSession(s.id, 'Tuesday')).name).toBe('Tuesday');
    expect((await setSessionNotes(s.id, 'hello')).notes).toBe('hello');
    await markThresholdMet(s.id, T0 + 5);
    const again = await markThresholdMet(s.id, T0 + 99);
    expect(again.thresholdMetAt).toBe(T0 + 5);
  });

  it('renaming never touches the undo slot', async () => {
    const s = await activeSession();
    await startContraction(s.id, T0 + 1);
    await renameSession(s.id, 'x');
    expect(await undoLast()).toBe('start');
  });
});

describe('contractions', () => {
  it('throws on a second open contraction', async () => {
    const s = await activeSession();
    await startContraction(s.id, T0 + 1);
    await expect(startContraction(s.id, T0 + 2)).rejects.toThrow(/in progress/);
  });

  it('only opens in the active session', async () => {
    const s = await activeSession();
    await endSession(s.id, T0 + MIN);
    await expect(startContraction(s.id, T0 + 2 * MIN)).rejects.toThrow(/active session/);
    await expect(startContraction('nope', T0)).rejects.toThrow(/active session/);
  });

  it('flags timeChanged when the clock went backwards', async () => {
    const s = await activeSession();
    const a = await startContraction(s.id, T0 + 10 * MIN);
    await stopContraction(a.id, T0 + 11 * MIN);
    const b = await startContraction(s.id, T0 + 5 * MIN);
    expect(b.timeChanged).toBe(true);
    await stopContraction(b.id, T0 + 6 * MIN);
    const c = await startContraction(s.id, T0 + 20 * MIN);
    expect(c.timeChanged).toBe(false);
  });

  it('discard hard-deletes and clears undo', async () => {
    const s = await activeSession();
    const c = await startContraction(s.id, T0 + 1);
    await discardContraction(c.id);
    expect(await getDb().contractions.get(c.id)).toBeUndefined();
    expect(await undoLast()).toBeNull();
  });

  it('rates 1-10 or null and rejects other values', async () => {
    const s = await activeSession();
    const c = await startContraction(s.id, T0 + 1);
    await stopContraction(c.id, T0 + MIN);
    expect((await rateContraction(c.id, 6)).intensity).toBe(6);
    expect((await rateContraction(c.id, null)).intensity).toBeNull();
    await expect(rateContraction(c.id, 11)).rejects.toBeInstanceOf(RangeError);
  });

  async function twoFinished() {
    const s = await activeSession();
    const a = await startContraction(s.id, T0 + MIN);
    await stopContraction(a.id, T0 + 2 * MIN);
    const b = await startContraction(s.id, T0 + 10 * MIN);
    await stopContraction(b.id, T0 + 11 * MIN);
    return { s, a, b };
  }

  it('updateContraction rejects overlaps with OverlapError carrying the other row', async () => {
    const { a, b } = await twoFinished();
    const err = await updateContraction(b.id, { startAt: T0 + 90_000 }).catch((e) => e);
    expect(err).toBeInstanceOf(OverlapError);
    expect((err as OverlapError).other.id).toBe(a.id);
    expect((await getDb().contractions.get(b.id))?.startAt).toBe(T0 + 10 * MIN);
  });

  it('touching contractions do not overlap', async () => {
    const { b } = await twoFinished();
    await expect(updateContraction(b.id, { startAt: T0 + 2 * MIN })).resolves.toBeDefined();
  });

  it('updateContraction rejects endAt <= startAt with RangeError', async () => {
    const { b } = await twoFinished();
    await expect(updateContraction(b.id, { endAt: b.startAt })).rejects.toBeInstanceOf(RangeError);
  });

  it('updateContraction sets reviewed and clears timeChanged', async () => {
    const s = await activeSession();
    const a = await startContraction(s.id, T0 + 10 * MIN);
    await stopContraction(a.id, T0 + 11 * MIN);
    const b = await startContraction(s.id, T0 + 5 * MIN);
    await stopContraction(b.id, T0 + 6 * MIN);
    const saved = await updateContraction(b.id, { note: 'ok' });
    expect(saved).toMatchObject({ reviewed: true, timeChanged: false, note: 'ok' });
  });

  it('addMissedContraction checks overlap and marks reviewed', async () => {
    const { s } = await twoFinished();
    const added = await addMissedContraction(s.id, { startAt: T0 + 5 * MIN, durationMs: 45_000, intensity: 4 });
    expect(added).toMatchObject({ reviewed: true, endAt: T0 + 5 * MIN + 45_000, intensity: 4 });
    await expect(addMissedContraction(s.id, { startAt: T0 + 10 * MIN + 1000, durationMs: 1000 })).rejects.toBeInstanceOf(OverlapError);
    await expect(addMissedContraction(s.id, { startAt: T0 + 30 * MIN, durationMs: 0 })).rejects.toBeInstanceOf(RangeError);
  });

  it('overlap ignores soft-deleted contractions', async () => {
    const { s, a } = await twoFinished();
    await deleteContraction(a.id);
    await expect(addMissedContraction(s.id, { startAt: a.startAt, durationMs: 30_000 })).resolves.toBeDefined();
  });
});

describe('events', () => {
  it('adds, updates and soft-deletes', async () => {
    const s = await activeSession();
    const e = await addEvent(s.id, { type: 'waters', at: T0 + MIN, details: 'clear' });
    expect(e).toMatchObject({ type: 'waters', details: 'clear', note: null, deletedAt: null });
    expect((await updateEvent(e.id, { details: 'pink' })).details).toBe('pink');
    await deleteEvent(e.id);
    expect((await getDb().events.get(e.id))?.deletedAt).not.toBeNull();
    await expect(updateEvent(e.id, { note: 'x' })).rejects.toThrow(/No event/);
  });
});

describe('settings', () => {
  it('getSettings writes the defaults once and updateSettings merges without undo', async () => {
    expect(await getDb().settings.count()).toBe(0);
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await getDb().settings.count()).toBe(1);
    const s = await activeSession();
    await startContraction(s.id, T0 + 1);
    const next = await updateSettings({ theme: 'day' });
    expect(next).toEqual({ ...DEFAULT_SETTINGS, theme: 'day' });
    expect(await undoLast()).toBe('start');
  });
});

describe('undo', () => {
  it('start round-trips', async () => {
    const s = await activeSession();
    const c = await startContraction(s.id, T0 + 1);
    expect(await undoLast()).toBe('start');
    expect(await getDb().contractions.get(c.id)).toBeUndefined();
  });

  it('stop round-trips back to the open row', async () => {
    const s = await activeSession();
    const c = await startContraction(s.id, T0 + 1);
    await stopContraction(c.id, T0 + MIN);
    expect(await undoLast()).toBe('stop');
    expect((await getDb().contractions.get(c.id))?.endAt).toBeNull();
  });

  it('rate round-trips', async () => {
    const s = await activeSession();
    const c = await startContraction(s.id, T0 + 1);
    await stopContraction(c.id, T0 + MIN);
    await rateContraction(c.id, 8);
    expect(await undoLast()).toBe('rate');
    expect((await getDb().contractions.get(c.id))?.intensity).toBeNull();
  });

  it('event round-trips', async () => {
    const s = await activeSession();
    const e = await addEvent(s.id, { type: 'note', at: T0 });
    expect(await undoLast()).toBe('event');
    expect(await getDb().events.get(e.id)).toBeUndefined();
  });

  it('edit round-trips for contractions and events', async () => {
    const s = await activeSession();
    const c = await startContraction(s.id, T0 + 1);
    await stopContraction(c.id, T0 + MIN);
    const before = (await getDb().contractions.get(c.id))!;
    await updateContraction(c.id, { note: 'changed' });
    expect(await undoLast()).toBe('edit');
    expect(await getDb().contractions.get(c.id)).toEqual(before);
    const e = await addEvent(s.id, { type: 'note', at: T0, note: 'a' });
    await updateEvent(e.id, { note: 'b' });
    expect(await undoLast()).toBe('edit');
    expect((await getDb().events.get(e.id))?.note).toBe('a');
  });

  it('delete round-trips for contractions and events', async () => {
    const s = await activeSession();
    const c = await startContraction(s.id, T0 + 1);
    await stopContraction(c.id, T0 + MIN);
    await deleteContraction(c.id);
    expect(await undoLast()).toBe('delete');
    expect((await getDb().contractions.get(c.id))?.deletedAt).toBeNull();
    const e = await addEvent(s.id, { type: 'note', at: T0 });
    await deleteEvent(e.id);
    expect(await undoLast()).toBe('delete');
    expect((await getDb().events.get(e.id))?.deletedAt).toBeNull();
  });

  it('add round-trips', async () => {
    const s = await activeSession();
    const added = await addMissedContraction(s.id, { startAt: T0 + MIN, durationMs: 30_000 });
    expect(await undoLast()).toBe('add');
    expect(await getDb().contractions.get(added.id)).toBeUndefined();
  });

  it('has depth 1: the second action replaces the first', async () => {
    const s = await activeSession();
    const c = await startContraction(s.id, T0 + 1);
    await stopContraction(c.id, T0 + MIN);
    expect(await undoLast()).toBe('stop');
    expect(await undoLast()).toBeNull();
    expect((await getDb().contractions.get(c.id))?.endAt).toBeNull();
  });

  it('writes the undo entry in the same transaction as the change', async () => {
    const s = await activeSession();
    const c = await startContraction(s.id, T0 + 1);
    const entry = await getDb().undo.get('singleton');
    expect(entry).toMatchObject({ kind: 'start', before: [{ table: 'contractions', id: c.id, value: null }] });
  });
});

describe('purgeExpired', () => {
  it('hard-deletes soft-deleted rows 24 h after the session ended, and only those', async () => {
    const s = await activeSession();
    const keep = await startContraction(s.id, T0 + MIN);
    await stopContraction(keep.id, T0 + 2 * MIN);
    const gone = await startContraction(s.id, T0 + 10 * MIN);
    await stopContraction(gone.id, T0 + 11 * MIN);
    await deleteContraction(gone.id);
    const ev = await addEvent(s.id, { type: 'note', at: T0 });
    await deleteEvent(ev.id);
    await endSession(s.id, T0 + 20 * MIN);
    const dayLater = T0 + 20 * MIN + 24 * 3_600_000;
    expect(await purgeExpired(dayLater - 1)).toBe(0);
    expect(await purgeExpired(dayLater)).toBe(2);
    expect(await getDb().contractions.get(gone.id)).toBeUndefined();
    expect(await getDb().events.get(ev.id)).toBeUndefined();
    expect(await getDb().contractions.get(keep.id)).toBeDefined();
  });

  it('leaves soft-deleted rows of an active session alone', async () => {
    const s = await activeSession();
    const c = await startContraction(s.id, T0 + MIN);
    await stopContraction(c.id, T0 + 2 * MIN);
    await deleteContraction(c.id);
    expect(await purgeExpired(T0 + 10 * 24 * 3_600_000)).toBe(0);
    expect(await getDb().contractions.get(c.id)).toBeDefined();
  });
});
