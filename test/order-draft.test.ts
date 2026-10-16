import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orderDraftReducer, type OrderDraft } from '../web/order-draft';

test('order draft moves preserve exact IDs and undo/redo/reset history', () => {
  const original = ['\\123/A', 'B', 'C'];
  const state: OrderDraft = { ids: original, past: [], future: [] };
  const moved = orderDraftReducer(state, { type: 'move', from: 0, to: 2 });
  assert.deepEqual(moved.ids, ['B', 'C', '\\123/A']);
  assert.deepEqual(original, ['\\123/A', 'B', 'C']);
  const undone = orderDraftReducer(moved, { type: 'undo' });
  assert.deepEqual(undone.ids, original);
  const redone = orderDraftReducer(undone, { type: 'redo' });
  assert.deepEqual(redone.ids, moved.ids);
  const reset = orderDraftReducer(redone, { type: 'reset', ids: original });
  assert.deepEqual(reset.ids, original);
  assert.deepEqual(orderDraftReducer(reset, { type: 'undo' }).ids, moved.ids);
  const branched = orderDraftReducer(undone, { type: 'move', from: 2, to: 0 });
  assert.deepEqual(branched.future, []);
  assert.equal(orderDraftReducer(state, { type: 'move', from: -1, to: 1 }), state);
});
