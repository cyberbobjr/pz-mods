import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Mod } from '../src/domain/mods';
import { groupMods } from '../web/parent-groups';
import { parentTitle, readSortMode, sortParentGroups } from '../web/mod-sort';

const mod = (id: string, workshopId?: string, date?: string): Mod => ({
  id,
  name: id,
  workshopId,
  metadataModifiedAt: date,
  source: `fixture/${id}`,
  description: '',
  requires: [],
  incompatible: [],
  variants: [],
});
const groups = groupMods([
  mod('Core', '123'),
  mod('Option', '123'),
  mod('Other', '456'),
  mod('Local', undefined, '2025-01-01T00:00:00Z'),
  mod('Unknown'),
]);
const details = {
  '123': { title: 'Zulu', time_updated: Date.parse('2026-01-01') / 1000 },
  '456': { title: 'Alpha', time_updated: Date.parse('2024-01-01') / 1000 },
};
const sort = (mode: Parameters<typeof sortParentGroups>[1]) =>
  sortParentGroups(groups, mode, details, ['Other', 'Option', 'Core'], 'fr');

test('sorts complete parents by displayed name and preserves submod save positions without mutation', () => {
  assert.deepEqual(
    sort('name-asc').map((g) => parentTitle(g, details)),
    ['Alpha', 'Local', 'Unknown', 'Zulu'],
  );
  assert.deepEqual(
    sort('name-desc').map((g) => parentTitle(g, details)),
    ['Zulu', 'Unknown', 'Local', 'Alpha'],
  );
  assert.deepEqual(
    sort('save')
      .slice(0, 2)
      .map((g) => g.key),
    ['workshop:456', 'workshop:123'],
  );
  assert.deepEqual(
    sort('name-asc')
      .at(-1)
      ?.members.map((m) => m.id),
    ['Option', 'Core'],
  );
  assert.deepEqual(
    groups[0].members.map((m) => m.id),
    ['Core', 'Option'],
  );
});

test('update dates combine Steam and local dates while missing dates always remain last', () => {
  assert.deepEqual(
    sort('updated-desc').map((g) => g.key),
    ['workshop:123', 'local:fixture/Local', 'workshop:456', 'local:fixture/Unknown'],
  );
  assert.deepEqual(
    sort('updated-asc').map((g) => g.key),
    ['workshop:456', 'local:fixture/Local', 'workshop:123', 'local:fixture/Unknown'],
  );
  const missing = sortParentGroups(groups, 'updated-asc', {}, [], 'en');
  assert.equal(missing[0].members[0].id, 'Local');
  assert.equal(readSortMode('invalid'), 'save');
  assert.equal(readSortMode('updated-desc'), 'updated-desc');
});
