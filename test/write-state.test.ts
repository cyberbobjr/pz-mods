import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sourceWriteReducer, type WriteState } from '../web/write-state';

test('collection writes are scoped by opaque source ID and only success gets a timestamp', () => {
  const initial: WriteState = { byId: {} };
  const pending = sourceWriteReducer(initial, {
    type: 'saving',
    id: 'collection:a',
    name: 'First',
  });
  assert.equal(pending.byId['collection:a'].phase, 'saving');
  assert.equal(pending.byId['collection:a'].savedAt, undefined);
  assert.equal(pending.byId['collection:b'], undefined);
  const saved = sourceWriteReducer(pending, {
    type: 'saved',
    id: 'collection:a',
    name: 'First',
    backup: 'backup.cfg',
    now: 1234,
  });
  assert.equal(saved.byId['collection:a'].savedAt, 1234);
  assert.equal(saved.byId['collection:a'].backup, 'backup.cfg');
  const other = sourceWriteReducer(saved, {
    type: 'error',
    id: 'collection:b',
    name: 'Second',
    message: 'Blocked',
  });
  assert.equal(other.byId['collection:a'].phase, 'saved');
  assert.equal(other.byId['collection:b'].phase, 'error');
  assert.equal(other.byId['collection:b'].savedAt, undefined);
});

test('no-op addition never becomes saved, and dismissing a toast preserves the source indicator', () => {
  const pending = sourceWriteReducer(
    { byId: {} },
    { type: 'saving', id: 'collection:a', name: 'First' },
  );
  const noop = sourceWriteReducer(pending, { type: 'idle', id: 'collection:a' });
  assert.equal(noop.byId['collection:a'], undefined);
  assert.equal(noop.toastId, undefined);
  const saved = sourceWriteReducer(noop, {
    type: 'saved',
    id: 'collection:a',
    name: 'First',
    now: 456,
  });
  const dismissed = sourceWriteReducer(saved, { type: 'dismiss' });
  assert.equal(dismissed.toastId, undefined);
  assert.equal(dismissed.byId['collection:a'].savedAt, 456);
  const profile = sourceWriteReducer(dismissed, {
    type: 'saved',
    id: 'collection:a',
    name: 'First',
    now: 789,
    silent: true,
  });
  assert.equal(profile.byId['collection:a'].savedAt, 789);
  assert.equal(profile.toastId, undefined);
});
