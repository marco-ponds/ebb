import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startSession } from './sessions';
import { closeSync, notifyChanged, startSync, type SyncMessage } from './sync';
import { dropDb, freshDb } from './testDb';

afterEach(async () => {
  closeSync();
});

const nextMessage = (ch: BroadcastChannel) =>
  new Promise<SyncMessage>((resolve) => {
    ch.onmessage = (ev) => resolve(ev.data as SyncMessage);
  });

describe('sync over BroadcastChannel ebb-sync', () => {
  it('posts { type: changed, tables } to another instance', async () => {
    const other = new BroadcastChannel('ebb-sync');
    const got = nextMessage(other);
    notifyChanged(['sessions', 'undo']);
    expect(await got).toEqual({ type: 'changed', tables: ['sessions', 'undo'] });
    other.close();
  });

  it('posts after every committed write', async () => {
    await freshDb();
    const other = new BroadcastChannel('ebb-sync');
    const got = nextMessage(other);
    await startSession(1000);
    expect((await got).type).toBe('changed');
    other.close();
    await dropDb();
  });

  it('a message from another tab refreshes live queries and notifies the listener', async () => {
    const fired = vi.fn();
    const sub = Dexie.on('storagemutated').subscribe(fired);
    const onRemote = vi.fn();
    startSync(onRemote);
    const other = new BroadcastChannel('ebb-sync');
    other.postMessage({ type: 'changed', tables: ['contractions'] });
    await vi.waitFor(() => expect(onRemote).toHaveBeenCalledWith(['contractions']));
    expect(fired).toHaveBeenCalled();
    other.close();
    Dexie.on('storagemutated').unsubscribe(sub as never);
  });

  it('ignores unrelated messages', async () => {
    const onRemote = vi.fn();
    startSync(onRemote);
    const other = new BroadcastChannel('ebb-sync');
    other.postMessage({ nope: true });
    other.postMessage({ type: 'changed', tables: ['sessions'] });
    await vi.waitFor(() => expect(onRemote).toHaveBeenCalledTimes(1));
    other.close();
  });
});
