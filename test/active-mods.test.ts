import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesActiveId, type Mod } from '../src/domain/mods';
import { matchesActive, sourceInventory, missingModIds, selectionId } from '../web/active-mods';

const mod = (id: string, workshopId?: string): Mod => ({
  id,
  name: id,
  workshopId,
  source: 'installed/' + id,
  description: '',
  requires: [],
  incompatible: [],
  variants: [],
});

test('missing qualified collection references remain active and removable without installed files', () => {
  const ids = ['  \\123/MissingMod  '];
  const inventory = sourceInventory([], ids, 'Missing files');
  assert.equal(inventory.length, 1);
  assert.equal(inventory[0].id, 'MissingMod');
  assert.equal(inventory[0].workshopId, '123');
  assert.equal(inventory[0].source, '');
  assert.equal(matchesActive(inventory[0], ids), true);
  assert.deepEqual(missingModIds(inventory, ids), ['123/MissingMod']);
});

test('one installed provider must not hide missing references to another provider of the same ID', () => {
  const installed = mod('Compat', '111');
  const ids = ['111/Compat', '222/Compat', '333/Compat', ' 222/Compat '];
  const inventory = sourceInventory([installed], ids, 'Missing files');
  assert.equal(inventory.length, 3);
  assert.deepEqual(
    inventory.map((item) => item.workshopId),
    ['111', '222', '333'],
  );
  assert.equal(
    inventory.filter((item) => !item.source).every((item) => matchesActive(item, ids)),
    true,
  );
  assert.deepEqual(missingModIds(inventory, ids), ['222/Compat', '333/Compat']);
  assert.equal(selectionId(inventory[0]), '111/Compat');
  const missingRequests = missingModIds(inventory, ids);
  assert.deepEqual(
    ids.filter((raw) => !missingRequests.some((requested) => matchesActiveId(requested, raw))),
    ['111/Compat'],
  );
  assert.deepEqual(
    ids.filter((raw) => !matchesActiveId(selectionId(inventory[0]), raw)),
    ['222/Compat', '333/Compat', ' 222/Compat '],
  );
});

test('unqualified local references use installed mods, while qualified references require their exact provider', () => {
  const local = mod('Local');
  const localInventory = sourceInventory([local], [' \\Local '], 'Missing files');
  assert.equal(localInventory.length, 1);
  assert.equal(localInventory[0].source, local.source);
  assert.equal(selectionId(localInventory[0]), 'Local');
  assert.equal(matchesActive(local, ['123/Local']), false);
  const inventory = sourceInventory([local], ['123/Local'], 'Missing files');
  assert.equal(inventory.length, 2);
  assert.equal(matchesActive(inventory[1], ['123/Local']), true);
  assert.deepEqual(missingModIds(inventory, ['Other']), []);
});

test('an unqualified active reference retains its original removal scope', () => {
  const ids = ['Compat', '111/Compat'];
  const inventory = sourceInventory([mod('Compat', '111')], ids, 'Missing files');
  assert.equal(selectionId(inventory[0]), 'Compat');
  assert.equal(matchesActiveId(selectionId(inventory[0]), '111/Compat'), true);
});
