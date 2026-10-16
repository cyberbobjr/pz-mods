import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { removalBlockers, type Mod } from '../src/domain/mods.js';
import { LocalLibrary } from '../src/adapters/local-library.js';
import { LocalProfileStore } from '../src/adapters/profile-store.js';
import { ProfileLibrary } from '../src/adapters/profile-library.js';
import { ModService } from '../src/application/service.js';

const mod = (id: string, workshopId?: string, requires: string[] = []): Mod => ({
  id,
  workshopId,
  requires,
  name: id,
  description: '',
  source: 'fixture',
  incompatible: [],
  variants: [],
});

test('removal protects installed providers and active consumers while permitting truly missing references', () => {
  const mods = [mod('Consumer', undefined, ['123/Dep']), mod('Dep', '456')];
  assert.deepEqual(removalBlockers(mods, ['Consumer', '123/Dep', '456/Dep'], ['123/Dep']), []);
  assert.deepEqual(removalBlockers(mods, ['Consumer', '123/Dep', '456/Dep'], ['456/Dep']), []);
  assert.deepEqual(
    removalBlockers(
      [mod('Consumer', undefined, ['Dep']), mod('Dep', '456')],
      ['Consumer', '456/Dep'],
      ['456/Dep'],
    ),
    ['Consumer'],
  );
  assert.deepEqual(
    removalBlockers(
      [mod('Consumer', '111', ['Dep']), mod('Consumer', '222'), mod('Dep', '456')],
      ['222/Consumer', '456/Dep'],
      ['456/Dep'],
    ),
    [],
  );
  assert.deepEqual(
    removalBlockers(
      [mod('Consumer', undefined, ['Missing'])],
      ['Consumer', 'Missing'],
      ['Missing'],
    ),
    [],
  );
});

async function fixture(ids: string[], required: string, installedProvider?: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-remove-missing-'));
  const userDir = path.join(root, 'user');
  const steamPath = path.join(root, 'steam');
  const cfg = path.join(userDir, 'Lua', 'pz_modlist_settings.cfg');
  const write = async (file: string, text: string) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text);
  };
  const original = `\ufeff!fav!:KeepFavorite;\r\nTarget:${ids.join(';')};\r\nOther:KeepOther;\r\n`;
  await write(cfg, original);
  await write(path.join(userDir, 'version.txt'), '42.13.1');
  await write(
    path.join(userDir, 'mods', 'Consumer', '42', 'mod.info'),
    `id=Consumer\nrequire=${required}`,
  );
  const depInfo = installedProvider
    ? path.join(
        steamPath,
        'steamapps',
        'workshop',
        'content',
        '108600',
        installedProvider,
        'mods',
        'Dep',
        '42',
        'mod.info',
      )
    : undefined;
  if (depInfo) await write(depInfo, 'id=Dep');
  const local = new LocalLibrary({ userDir, steamPath, isGameRunning: async () => false });
  await local.init();
  const library = new ProfileLibrary(local, new LocalProfileStore());
  const service = new ModService(
    library,
    { details: async () => ({}) },
    { get: async () => undefined },
  );
  const collection = (await library.saves()).find((source) => source.name === 'Target')!;
  const snapshot = await library.readSave(collection.id);
  return { root, userDir, cfg, original, depInfo, local, library, service, collection, snapshot };
}

test('ModService removes a missing collection reference with backup while retaining unresolved dependency warnings', async () => {
  const f = await fixture(['Consumer', 'Missing', 'AnotherMissing'], 'Missing');
  try {
    const result = await f.service.remove(f.collection.id, ['Missing'], f.snapshot.revision);
    assert.deepEqual(await fs.readFile(result.backup), Buffer.from(f.original, 'utf8'));
    assert.equal(
      path.dirname(result.backup),
      await fs.realpath(path.join(f.userDir, 'backups', 'pz-mods', 'profiles')),
    );
    assert.equal(
      await fs.readFile(f.cfg, 'utf8'),
      f.original.replace(
        'Target:Consumer;Missing;AnotherMissing;',
        'Target:Consumer;AnotherMissing;',
      ),
    );
    const overview = await f.service.overview(f.collection.id);
    assert.ok(
      overview.issues.some(
        (issue) =>
          issue.kind === 'dependency' && issue.modId === 'Consumer' && issue.target === 'Missing',
      ),
    );
    assert.ok(
      overview.issues.some((issue) => issue.kind === 'missing' && issue.modId === 'AnotherMissing'),
    );
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('removing a qualified missing provider never removes another installed provider of the same ID', async () => {
  const f = await fixture(['Consumer', '123/Dep', '456/Dep'], '123/Dep', '456');
  try {
    assert.deepEqual((await f.local.scan()).find((item) => item.id === 'Consumer')?.requires, [
      '123/Dep',
    ]);
    const result = await f.service.remove(f.collection.id, ['123/Dep'], f.snapshot.revision);
    assert.equal(await fs.readFile(result.backup, 'utf8'), f.original);
    assert.deepEqual((await f.library.readSave(f.collection.id)).ids, ['Consumer', '456/Dep']);
    const overview = await f.service.overview(f.collection.id);
    assert.ok(
      overview.issues.some(
        (issue) =>
          issue.kind === 'dependency' && issue.modId === 'Consumer' && issue.target === 'Dep',
      ),
    );
    assert.equal(await fs.readFile(f.cfg, 'utf8'), f.original.replace('123/Dep;', ''));
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('installed required providers remain blocked, but removing their stale sibling is allowed', async () => {
  const f = await fixture(['Consumer', '123/Dep', '456/Dep'], '456/Dep', '456');
  try {
    await assert.rejects(
      f.service.remove(f.collection.id, ['456/Dep'], f.snapshot.revision),
      /Retrait bloqué/,
    );
    assert.equal(await fs.readFile(f.cfg, 'utf8'), f.original);
    await assert.rejects(fs.stat(path.join(f.userDir, 'backups')));
    await f.service.remove(f.collection.id, ['123/Dep'], f.snapshot.revision);
    assert.deepEqual((await f.library.readSave(f.collection.id)).ids, ['Consumer', '456/Dep']);
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('removal refreshes the inventory before treating a dependency as missing', async () => {
  const f = await fixture(['Consumer', '456/Dep'], 'Dep', '456');
  try {
    assert.ok((await f.local.scan()).some((item) => item.id === 'Dep'));
    await fs.unlink(f.depInfo!);
    assert.ok((await f.local.scan()).some((item) => item.id === 'Dep'));
    await f.service.remove(f.collection.id, ['456/Dep'], f.snapshot.revision);
    assert.deepEqual((await f.library.readSave(f.collection.id)).ids, ['Consumer']);
    assert.ok(
      (await f.service.overview(f.collection.id)).issues.some(
        (issue) => issue.kind === 'dependency',
      ),
    );
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('physical save cleanup also preserves a different qualified provider and unrelated lines', async () => {
  const f = await fixture(['Consumer'], '123/Dep', '456');
  try {
    const file = path.join(f.userDir, 'Saves', 'Sandbox', 'Qualified', 'mods.txt');
    await fs.mkdir(path.dirname(file), { recursive: true });
    const original =
      'mods\r\n{\r\n mod=Consumer,\r\n mod=\\123/Dep,\r\n # keep\r\n mod=\\456/Dep,\r\n maps=Keep,\r\n}\r\n';
    await fs.writeFile(file, original);
    const physical = (await f.library.saves()).find((source) => source.kind === 'save')!;
    const snapshot = await f.library.readSave(physical.id);
    const result = await f.service.remove(physical.id, ['123/Dep'], snapshot.revision);
    assert.equal(await fs.readFile(result.backup, 'utf8'), original);
    assert.equal(await fs.readFile(file, 'utf8'), original.replace(' mod=\\123/Dep,\r\n', ''));
    const current = await f.library.readSave(physical.id);
    assert.deepEqual(current.ids, ['Consumer', '\\456/Dep']);
    await assert.rejects(f.service.remove(physical.id, ['123/Dep'], current.revision), /actif/);
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});
