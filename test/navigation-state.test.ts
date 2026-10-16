import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_NAVIGATION_STATE,
  NAVIGATION_STORAGE_KEY,
  parseNavigationState,
  readNavigationState,
  writeNavigationState,
  type NavigationState,
  navigationContextKey,
} from '../web/navigation-state.js';

test('versioned navigation state round-trips all supported tabs and optional save selection', () => {
  for (const tab of ['active', 'all', 'unused', 'missing', 'issues'] as const) {
    const state: NavigationState = {
      version: 1,
      tab,
      search: 'mod search',
      page: 12,
      saveId: 'fixture-save',
    };
    let value: string | null = null;
    assert.equal(
      writeNavigationState(state, {
        setItem: (key, next) => {
          assert.equal(key, NAVIGATION_STORAGE_KEY);
          value = next;
        },
      }),
      true,
    );
    assert.deepEqual(
      readNavigationState({
        getItem: (key) => {
          assert.equal(key, NAVIGATION_STORAGE_KEY);
          return value;
        },
      }),
      state,
    );
  }
});

test('missing, malformed and unsupported navigation versions fall back safely', () => {
  for (const value of [
    null,
    '',
    '{',
    'null',
    '[]',
    '42',
    '{"tab":"all"}',
    '{"version":2,"tab":"all"}',
  ]) {
    assert.deepEqual(parseNavigationState(value), DEFAULT_NAVIGATION_STATE);
  }
  const state = parseNavigationState(null);
  state.search = 'independent';
  assert.equal(parseNavigationState(null).search, '');
});

test('navigation fields are bounded and unexpected fields are discarded', () => {
  const result = parseNavigationState(
    JSON.stringify({
      version: 1,
      tab: 'invalid',
      search: 'x'.repeat(501),
      page: 100001,
      saveId: 'x'.repeat(257),
      extra: 'ignored',
    }),
  );
  assert.deepEqual(result, { version: 1, tab: 'active', search: 'x'.repeat(500), page: 1 });
  for (const page of [0, -1, 1.5, '2', null]) {
    assert.equal(
      parseNavigationState(JSON.stringify({ version: 1, tab: 'all', search: 3, page })).page,
      1,
    );
  }
  for (const saveId of ['', 'bad\nidentifier', false, null]) {
    assert.equal(parseNavigationState(JSON.stringify({ version: 1, saveId })).saveId, undefined);
  }
  assert.equal(parseNavigationState(JSON.stringify({ version: 1, page: 100000 })).page, 100000);
});

test('unavailable storage and storage exceptions never prevent navigation', () => {
  assert.deepEqual(readNavigationState(), DEFAULT_NAVIGATION_STATE);
  assert.equal(writeNavigationState({ ...DEFAULT_NAVIGATION_STATE }), false);
  assert.deepEqual(
    readNavigationState({
      getItem: () => {
        throw Error('Blocked');
      },
    }),
    DEFAULT_NAVIGATION_STATE,
  );
  assert.equal(
    writeNavigationState(
      { ...DEFAULT_NAVIGATION_STATE },
      {
        setItem: () => {
          throw Error('Quota exceeded');
        },
      },
    ),
    false,
  );
});

test('contexts preserve separate save and tab positions with bounded validation', () => {
  const first = navigationContextKey('save-a', 'active');
  const second = navigationContextKey('save-b', 'active');
  const third = navigationContextKey('save-a', 'all');
  assert.equal(new Set([first, second, third]).size, 3);
  const contexts = Object.fromEntries([
    [first, { search: 'first', page: 3 }],
    [second, { search: 'second', page: 7 }],
    [third, { search: 'x'.repeat(501), page: -1 }],
    ['k'.repeat(301), { search: 'excluded', page: 2 }],
    ['bad-value', []],
    ...Array.from({ length: 201 }, (_, index) => [`extra-${index}`, { search: '', page: 1 }]),
  ]);
  const parsed = parseNavigationState(JSON.stringify({ version: 1, contexts }));
  assert.equal(Object.keys(parsed.contexts || {}).length, 200);
  assert.deepEqual(parsed.contexts?.[first], { search: 'first', page: 3 });
  assert.deepEqual(parsed.contexts?.[second], { search: 'second', page: 7 });
  assert.deepEqual(parsed.contexts?.[third], { search: 'x'.repeat(500), page: 1 });
  assert.equal(parsed.contexts?.['k'.repeat(301)], undefined);
  assert.equal(parsed.contexts?.['bad-value'], undefined);
});
