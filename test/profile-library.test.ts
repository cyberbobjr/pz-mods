import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ProfileLibrary } from '../src/adapters/profile-library.js';
import { LocalLibrary } from '../src/adapters/local-library.js';
import { LocalProfileStore } from '../src/adapters/profile-store.js';
import { ModService } from '../src/application/service.js';
import { ProfileService } from '../src/application/profiles.js';
import { TransferService } from '../src/application/transfers.js';
import { parseProfileCollections } from '../src/domain/profiles.js';

async function fixture(withConfig = true, running = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-profile-library-'));
  const userDir = path.join(root, 'user');
  const steamPath = path.join(root, 'steam');
  const cfg = path.join(userDir, 'Lua', 'pz_modlist_settings.cfg');
  const write = async (file: string, text: string) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text);
  };
  await write(
    path.join(userDir, 'Saves', 'Sandbox', 'Physical', 'mods.txt'),
    'mods\n{\nmod=Dep,\n}\n',
  );
  await write(path.join(userDir, 'version.txt'), '42.13.1');
  await write(path.join(userDir, 'mods', 'Dep', '42', 'mod.info'), 'id=Dep');
  await write(path.join(userDir, 'mods', 'A', '42', 'mod.info'), 'id=A\nrequire=Dep');
  await write(path.join(userDir, 'mods', 'B', '42', 'mod.info'), 'id=B');
  await write(
    path.join(
      steamPath,
      'steamapps',
      'workshop',
      'content',
      '108600',
      '123',
      'mods',
      'Remote',
      '42',
      'mod.info',
    ),
    'id=Remote',
  );
  const original =
    '\ufeff!fav!:HiddenFavorite;\r\nCollection:Dep;A;B;\r\nOther:B;\r\n# unrelated line\r\n';
  if (withConfig) await write(cfg, original);
  const local = new LocalLibrary({ userDir, steamPath, isGameRunning: async () => running });
  await local.init();
  const store = new LocalProfileStore();
  const library = new ProfileLibrary(local, store);
  const service = new ModService(
    library,
    { details: async () => ({}) },
    { get: async () => undefined },
  );
  return { root, userDir, steamPath, cfg, write, original, local, store, library, service };
}

test('collection sources exclude favorites, preserve qualified IDs and expose no invented save version', async () => {
  const f = await fixture();
  try {
    const saves = await f.library.saves();
    assert.equal(saves.filter((save) => save.kind === 'save').length, 1);
    const collection = saves.find((save) => save.name === 'Collection')!;
    assert.equal(collection.kind, 'collection');
    assert.match(collection.id, /^collection:[a-f0-9]{24}$/);
    assert.ok(Number.isFinite(Date.parse(collection.modified)));
    const snapshot = await f.library.readSave(collection.id);
    assert.deepEqual(snapshot.ids, ['Dep', 'A', 'B']);
    assert.equal(snapshot.kind, 'collection');
    assert.equal(snapshot.version, undefined);
    const overview = await f.service.overview(collection.id);
    assert.doesNotMatch(JSON.stringify(overview), /HiddenFavorite/);
    assert.equal(overview.version, undefined);
    assert.deepEqual(overview.active, ['Dep', 'A', 'B']);
    assert.deepEqual(
      parseProfileCollections(
        '!fav!:Hidden;\n#Ma collection:123/Mod;123/Mod;Vehicle:Core;\n',
        true,
      ),
      [{ name: '#Ma collection', ids: ['123/Mod', 'Vehicle:Core'] }],
    );
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('ModService collection add, dependency protection, reorder and removal preserve other cfg bytes with backups', async () => {
  const f = await fixture();
  try {
    const collection = (await f.library.saves()).find((save) => save.name === 'Collection')!;
    let snapshot = await f.library.readSave(collection.id);
    const preview = await f.service.validateAdd(collection.id, '\\123/Remote', snapshot.revision);
    assert.equal(preview.missing, false);
    assert.equal(await fs.readFile(f.cfg, 'utf8'), f.original);
    const add = await f.service.add(collection.id, '\\123/Remote', snapshot.revision);
    assert.equal(await fs.readFile(add.backup!, 'utf8'), f.original);
    let expected = f.original.replace('Collection:Dep;A;B;', 'Collection:Dep;A;B;123/Remote;');
    assert.equal(await fs.readFile(f.cfg, 'utf8'), expected);
    snapshot = await f.library.readSave(collection.id);
    assert.deepEqual(snapshot.ids, ['Dep', 'A', 'B', '123/Remote']);
    await assert.rejects(
      f.service.remove(collection.id, ['Dep'], snapshot.revision),
      /Retrait bloqué/,
    );
    await assert.rejects(
      f.service.reorder(collection.id, ['A', 'Dep', 'B', '123/Remote'], snapshot.revision),
      /Nouvelle contrainte/,
    );
    const reorder = await f.service.reorder(
      collection.id,
      ['B', '123/Remote', 'Dep', 'A'],
      snapshot.revision,
    );
    assert.equal(await fs.readFile(reorder.backup, 'utf8'), expected);
    expected = expected.replace('Collection:Dep;A;B;123/Remote;', 'Collection:B;123/Remote;Dep;A;');
    assert.equal(await fs.readFile(f.cfg, 'utf8'), expected);
    snapshot = await f.library.readSave(collection.id);
    await f.service.remove(collection.id, ['A'], snapshot.revision);
    expected = expected.replace('Collection:B;123/Remote;Dep;A;', 'Collection:B;123/Remote;Dep;');
    assert.equal(await fs.readFile(f.cfg, 'utf8'), expected);
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('another profile edit invalidates a collection revision but not its stable ID', async () => {
  const f = await fixture();
  try {
    const collection = (await f.library.saves()).find((save) => save.name === 'Collection')!;
    const snapshot = await f.library.readSave(collection.id);
    const changed = f.original.replace('Other:B;', 'Other:Changed;');
    await fs.writeFile(f.cfg, changed);
    assert.equal(
      (await f.library.saves()).find((save) => save.name === 'Collection')?.id,
      collection.id,
    );
    await assert.rejects(f.service.add(collection.id, 'Missing', snapshot.revision), /changé/);
    await assert.rejects(
      f.library.reorder(collection.id, snapshot.ids, snapshot.revision),
      /changé/,
    );
    assert.equal(await fs.readFile(f.cfg, 'utf8'), changed);
    assert.deepEqual(await fs.readdir(path.dirname(f.cfg)), ['pz_modlist_settings.cfg']);
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('missing or malformed cfg leaves physical saves available and surfaces a visible collection warning', async () => {
  const f = await fixture(false);
  try {
    const physical = (await f.library.saves())[0];
    assert.equal(physical.kind, 'save');
    await assert.rejects(fs.stat(path.dirname(f.cfg)));
    assert.equal((await f.service.overview(physical.id)).collectionWarning, undefined);
    await f.write(f.cfg, '!fav!:\nDuplicate:A;\nDuplicate:B;\n');
    const overview = await f.service.overview(physical.id);
    assert.equal(overview.saves.length, 1);
    assert.match(overview.collectionWarning || '', /Plusieurs profils/);
    assert.deepEqual(await fs.readdir(path.dirname(f.cfg)), ['pz_modlist_settings.cfg']);
    await fs.writeFile(f.cfg, '!fav!:\nValid:Dep;\n');
    assert.equal((await f.service.overview(physical.id)).collectionWarning, undefined);
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('collection IDs are scoped to the configured canonical user directory and reject stale selection', async () => {
  const f = await fixture();
  try {
    const original = (await f.library.saves()).find((save) => save.kind === 'collection')!;
    const second = path.join(f.root, 'second');
    await f.write(path.join(second, 'Lua', 'pz_modlist_settings.cfg'), f.original);
    await f.local.configure({ userDir: second });
    const next = (await f.library.saves()).find((save) => save.name === original.name)!;
    assert.notEqual(next.id, original.id);
    await assert.rejects(f.library.readSave(original.id), /Collection locale introuvable/);
    assert.equal(
      await fs.readFile(path.join(second, 'Lua', 'pz_modlist_settings.cfg'), 'utf8'),
      f.original,
    );
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('composed sources support profile and dedicated exports while physical save mutations still delegate', async () => {
  const f = await fixture();
  try {
    const saves = await f.library.saves();
    const collection = saves.find((save) => save.name === 'Collection')!;
    const physical = saves.find((save) => save.kind === 'save')!;
    const snapshot = await f.library.readSave(collection.id);
    const profiles = new ProfileService(f.library, f.store);
    const preview = await profiles.preview(collection.id, snapshot.revision, 'Copy');
    await profiles.export(collection.id, snapshot.revision, 'Copy', preview.profileRevision, false);
    assert.ok(
      (await f.library.saves()).some((save) => save.name === 'Copy' && save.kind === 'collection'),
    );
    const transfers = new TransferService(f.library);
    const current = await f.library.readSave(collection.id);
    assert.match(
      (await transfers.exportSave(collection.id, current.revision)).serverText,
      /Mods=Dep;A;B/,
    );
    const original = await f.library.readSave(physical.id);
    await f.service.add(physical.id, 'B', original.revision);
    assert.deepEqual((await f.library.readSave(physical.id)).ids, ['Dep', 'B']);
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('collection mutations require a closed game and reject malformed reorder permutations', async () => {
  const f = await fixture(true, true);
  try {
    const collection = (await f.library.saves()).find((save) => save.kind === 'collection')!;
    const snapshot = await f.library.readSave(collection.id);
    await assert.rejects(
      f.service.add(collection.id, 'Missing', snapshot.revision),
      /Ferme Project Zomboid/,
    );
    assert.equal(await fs.readFile(f.cfg, 'utf8'), f.original);
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
  const idle = await fixture();
  try {
    const collection = (await idle.library.saves()).find((save) => save.kind === 'collection')!;
    const snapshot = await idle.library.readSave(collection.id);
    await assert.rejects(
      idle.library.reorder(collection.id, ['A', 'A', 'B'], snapshot.revision),
      /réorganisation invalides/,
    );
    assert.equal(await fs.readFile(idle.cfg, 'utf8'), idle.original);
  } finally {
    await fs.rm(idle.root, { recursive: true, force: true });
  }
});
