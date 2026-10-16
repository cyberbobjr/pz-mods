import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateLoadOrder, isExactPermutation, type Mod } from '../src/domain/mods.js';
import { ModService, type LibraryPort } from '../src/application/service.js';
import { LocalLibrary } from '../src/adapters/local-library.js';

const mod = (id: string, extra: Partial<Mod> = {}): Mod => ({
  id,
  name: id,
  description: '',
  source: 'fixture',
  variants: [],
  requires: [],
  incompatible: [],
  ...extra,
});

test('load order checks active requirements and qualified before/after constraints', () => {
  const mods = [
    mod('A', { requires: ['B', 'Absent'], loadAfter: ['\\123/C'], loadBefore: ['D'] }),
    mod('B'),
    mod('C', { workshopId: '123' }),
    mod('D'),
  ];
  assert.deepEqual(
    validateLoadOrder(mods, ['D', 'A', 'B', '\\123/C']).map((issue) => issue.kind),
    ['require', 'after', 'before'],
  );
  assert.deepEqual(validateLoadOrder(mods, ['B', '\\123/C', 'A', 'D']), []);
  assert.ok(isExactPermutation(['\\123/A', 'B'], ['B', '\\123/A']));
  assert.equal(isExactPermutation(['\\123/A', 'B'], ['B', 'A']), false);
  assert.equal(isExactPermutation(['A', 'B'], ['A', 'A']), false);
});

test('service validates without writes and allows existing problems while blocking new ones', async () => {
  let writes = 0;
  const mods = [mod('A', { requires: ['B'] }), mod('B'), mod('C', { loadBefore: ['A'] })];
  const library: LibraryPort = {
    readSave: async () => ({ ids: ['A', 'B', 'C'], revision: 'revision' }),
    scan: async () => mods,
    saves: async () => [],
    status: async () => ({}),
    image: async () => undefined,
    remove: async () => '',
    reorder: async () => {
      writes++;
      return 'backup';
    },
  };
  const service = new ModService(
    library,
    { details: async () => ({}) },
    { get: async () => undefined },
  );
  const original = await service.validateOrder('save', ['A', 'B', 'C'], 'revision');
  assert.equal(original.violations.length, 2);
  assert.equal(original.newViolations.length, 0);
  assert.equal(writes, 0);
  await service.reorder('save', ['B', 'A', 'C'], 'revision');
  assert.equal(writes, 1);
  // Both old constraints may be kept; no new constraint may be introduced.
  library.readSave = async () => ({ ids: ['B', 'C', 'A'], revision: 'revision' });
  await assert.rejects(service.reorder('save', ['A', 'B', 'C'], 'revision'), /Nouvelle contrainte/);
  await assert.rejects(service.validateOrder('save', ['B', 'A'], 'revision'), /exactement/);
  await assert.rejects(service.reorder('save', ['B', 'C', 'A'], 'stale'), /changé/);
  assert.equal(writes, 1);
});

test('reordering fixture preserves non-mod bytes, qualifiers, line formatting and backups', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-order-'));
  try {
    const file = path.join(root, 'Saves', 'Sandbox', 'fixture', 'mods.txt');
    await fs.mkdir(path.dirname(file), { recursive: true });
    const original =
      'VERSION=1\r\nmods\r\n{\r\n  mod = \\123/A,\r\n  # comment\r\n maps=MapOne,MapTwo\r\n\tmod=B,  \r\n}\r\n';
    await fs.writeFile(file, original);
    const modFolder = path.join(root, 'mods', 'OrderMetadata');
    await fs.mkdir(modFolder, { recursive: true });
    await fs.writeFile(
      path.join(modFolder, 'mod.info'),
      'id=A\nloadModAfter=\\123/B,C\nloadModBefore=D',
    );
    const library = new LocalLibrary({
      userDir: root,
      steamPath: path.join(root, 'steam'),
      isGameRunning: async () => false,
    });
    await library.init();
    const [metadata] = await library.scan();
    assert.deepEqual(metadata.loadAfter, ['\\123/B', 'C']);
    assert.deepEqual(metadata.loadBefore, ['D']);
    const [save] = await library.saves();
    const before = await library.readSave(save.id);
    const backup = await library.reorder(save.id, ['B', '\\123/A'], before.revision);
    assert.equal(await fs.readFile(backup, 'utf8'), original);
    assert.equal(
      await fs.readFile(file, 'utf8'),
      original.replace('mod = \\123/A,', 'mod = B,').replace('mod=B,', 'mod=\\123/A,'),
    );
    await assert.rejects(library.reorder(save.id, ['B', '\\123/A'], before.revision), /changé/);
    const after = await library.readSave(save.id);
    await assert.rejects(library.reorder(save.id, ['B', 'A'], after.revision), /invalides/);
    const running = new LocalLibrary({
      userDir: root,
      steamPath: path.join(root, 'steam'),
      isGameRunning: async () => true,
    });
    await running.init();
    await running.saves();
    await assert.rejects(
      running.reorder(save.id, ['B', '\\123/A'], after.revision),
      /Ferme Project Zomboid/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
