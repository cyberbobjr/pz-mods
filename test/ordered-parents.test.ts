import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Mod } from '../src/domain/mods';
import { groupMods } from '../web/parent-groups';
import { loadPosition, orderParentGroups } from '../web/load-order';

test('interleaved submods keep a single parent row with exact positions', () => {
  const mod = (id: string, workshopId: string): Mod => ({
    id,
    workshopId,
    name: id,
    description: '',
    source: id,
    requires: [],
    incompatible: [],
    variants: [],
  });
  const core = mod('Core', '123');
  const option = mod('Textures', '123');
  const disabled = mod('Optional', '123');
  const other = mod('Other', '456');
  const ids = ['Core', 'Other', 'Textures'];
  const groups = orderParentGroups(groupMods([disabled, other, option, core]), ids);
  assert.equal(groups.filter((group) => group.key === 'workshop:123').length, 1);
  assert.deepEqual(
    groups[0].members.map((item) => item.id),
    ['Core', 'Textures', 'Optional'],
  );
  assert.deepEqual(
    groups[0].members.map((item) => loadPosition(item, ids)),
    [1, 3, undefined],
  );
  assert.equal(loadPosition(mod('Core', '999'), ['\\123/Core']), undefined);
});
