import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupMods } from '../web/parent-groups';
import type { Mod } from '../src/domain/mods';

const fixture = (id: string, source: string, workshopId?: string): Mod => ({
  id,
  source,
  workshopId,
  name: id,
  description: '',
  requires: [],
  incompatible: [],
  variants: [],
});

test('parents group Workshop IDs and local projects without merging unrelated local mods', () => {
  const groups = groupMods([
    fixture('Main', 'steam/main', '123'),
    fixture('Option', 'steam/option', '123'),
    fixture('Other', 'steam/other', '456'),
    fixture('LocalMain', 'C:\\Zomboid\\Workshop\\Project\\Contents\\mods\\Main\\42\\mod.info'),
    fixture('LocalOption', 'C:\\Zomboid\\Workshop\\Project\\Contents\\mods\\Option\\42\\mod.info'),
    fixture('Separate', 'C:\\Zomboid\\mods\\Separate\\42\\mod.info'),
  ]);
  assert.deepEqual(
    groups.map((group) => group.members.map((mod) => mod.id)),
    [['Main', 'Option'], ['Other'], ['LocalMain', 'LocalOption'], ['Separate']],
  );
});
