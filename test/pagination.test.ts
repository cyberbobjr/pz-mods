import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paginate, readPageSize } from '../web/pagination';

test('pagination preference accepts supported values and falls back for invalid storage', () => {
  assert.equal(readPageSize('100'), 100);
  for (const value of [null, '', 'NaN', '0', '-1', '9999']) assert.equal(readPageSize(value), 36);
});

test('pagination handles partial pages, filtered results and empty inventories', () => {
  assert.deepEqual(paginate(65, 3, 24), { page: 3, pageCount: 3, start: 48, end: 65 });
  assert.deepEqual(paginate(10, 3, 24), { page: 1, pageCount: 1, start: 0, end: 10 });
  assert.deepEqual(paginate(0, 1, 100), { page: 1, pageCount: 1, start: 0, end: 0 });
});
