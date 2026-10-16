import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectionContexts } from '../web/collection-contexts';
import { navigationContextKey } from '../web/navigation-state';

test('rename moves all contexts to the new opaque ID and preserves unrelated sources', () => {
  const oldActive = navigationContextKey('collection:old', 'active');
  const oldUnused = navigationContextKey('collection:old', 'unused');
  const other = navigationContextKey('physical-save', 'issues');
  const initial = {
    [oldActive]: { search: 'old', page: 2 },
    [oldUnused]: { search: 'not active', page: 4 },
    [other]: { search: 'other', page: 3 },
  };
  const result = collectionContexts(initial, 'collection:old', 'collection:new', 'rename', {
    tab: 'active',
    search: 'current filter',
    page: 5,
  });
  assert.equal(result[oldActive], undefined);
  assert.equal(result[oldUnused], undefined);
  assert.deepEqual(result[navigationContextKey('collection:new', 'active')], {
    search: 'current filter',
    page: 5,
  });
  assert.deepEqual(result[navigationContextKey('collection:new', 'unused')], initial[oldUnused]);
  assert.deepEqual(result[other], initial[other]);
  assert.equal(initial[oldActive].search, 'old');
});

test('duplicate copies current filters even when the context ref has not recorded them yet', () => {
  const result = collectionContexts({}, 'collection:old', 'collection:new', 'duplicate', {
    tab: 'all',
    search: 'Timber',
    page: 7,
  });
  assert.deepEqual(result[navigationContextKey('collection:old', 'all')], {
    search: 'Timber',
    page: 7,
  });
  assert.deepEqual(result[navigationContextKey('collection:new', 'all')], {
    search: 'Timber',
    page: 7,
  });
  assert.notEqual(
    result[navigationContextKey('collection:old', 'all')],
    result[navigationContextKey('collection:new', 'all')],
  );
});
