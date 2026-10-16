import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Mod } from '../src/domain/mods';
import { dependentsOf, parentDependents } from '../web/dependents';

function mod(id: string, requires: string[] = [], workshopId?: string, source = id): Mod {
  return {
    id,
    requires,
    workshopId,
    source,
    name: id,
    description: '',
    incompatible: [],
    variants: [],
  };
}

test('local dependencies normalize references, exclude self and retain inactive consumers', () => {
  const core = mod('Core', ['Core']);
  const option = mod('Option', ['  \\Core  ']);
  const inactive = mod('InactiveAddon', ['Core']);
  const indirect = mod('Indirect', ['Option']);
  assert.deepEqual(dependentsOf(core, [core, option, inactive, indirect]), [option, inactive]);
});

test('qualified requirements match only the specified Workshop provider', () => {
  const first = mod('Core', [], '111');
  const second = mod('Core', [], '222');
  const local = mod('Core');
  const qualified = mod('QualifiedAddon', ['  \\111/Core '], '333');
  const unqualified = mod('Addon', ['Core']);
  assert.deepEqual(dependentsOf(first, [qualified, unqualified]), [qualified, unqualified]);
  assert.deepEqual(dependentsOf(second, [qualified, unqualified]), [unqualified]);
  assert.deepEqual(dependentsOf(local, [qualified, unqualified]), [unqualified]);
});

test('consumer variants are deduplicated by provider and ID without merging distinct providers', () => {
  const core = mod('Core');
  const first = mod('Addon', ['Core'], '111', '111/Addon/41/mod.info');
  const variant = mod('Addon', ['Core'], '111', '111/Addon/42/mod.info');
  const otherProvider = mod('Addon', ['Core'], '222');
  const local = mod('Addon', ['Core']);
  assert.deepEqual(dependentsOf(core, [first, variant, otherProvider, local]), [
    first,
    otherProvider,
    local,
  ]);
});

test('parent consumers include internal requirements and deduplicate the union', () => {
  const unused = mod('Unused', [], '111');
  const core = mod('Core', [], '111');
  const option = mod('Option', ['111/Core'], '111');
  const external = mod('External', ['Core', 'Option'], '222');
  const result = parentDependents({ key: 'workshop:111', members: [unused, core, option] }, [
    unused,
    core,
    option,
    external,
  ]);
  assert.equal(result.requiredMember, core);
  assert.deepEqual(result.mods, [option, external]);
});

test('parent with no direct consumers has no required member', () => {
  const core = mod('Core', [], '111');
  assert.deepEqual(parentDependents({ key: 'workshop:111', members: [core] }, [core]), {
    mods: [],
    requiredMember: undefined,
  });
});
