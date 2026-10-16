import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deleteProfile } from '../src/domain/profiles.js';
import { ProfileService } from '../src/application/profiles.js';
import { LocalLibrary } from '../src/adapters/local-library.js';
import { ProfileLibrary } from '../src/adapters/profile-library.js';
import { LocalProfileStore } from '../src/adapters/profile-store.js';

test('profile deletion removes only the exact target and preserves BOM, favorites and surrounding bytes', () => {
  const original =
    '\ufeff!fav!:KeepFavorite;\r\nAlpha:A;\r\n# unknown line\r\nAlpha copy:B;\r\nLast:C;';
  assert.equal(deleteProfile(original, true, 'Alpha'), original.replace('Alpha:A;\r\n', ''));
  assert.equal(deleteProfile(original, true, 'Last'), original.replace('Last:C;', ''));
  assert.equal(deleteProfile('!fav!:\nOnly:A;\n', true, 'Only'), '!fav!:\n');
  for (const name of ['!fav!', 'Absent', 'alpha', ' Alpha '])
    assert.throws(() => deleteProfile(original, true, name));
  assert.throws(
    () => deleteProfile('!fav!:\nAlpha:A;\nAlpha:B;\n', true, 'Alpha'),
    /Plusieurs profils/,
  );
  assert.throws(() => deleteProfile('', false, 'Alpha'), /introuvable/);
});

async function fixture(running = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-delete-profile-'));
  const cfg = path.join(root, 'Lua', 'pz_modlist_settings.cfg');
  const physicalFile = path.join(root, 'Saves', 'Sandbox', 'Physical', 'mods.txt');
  await fs.mkdir(path.dirname(cfg), { recursive: true });
  await fs.mkdir(path.dirname(physicalFile), { recursive: true });
  const original = '\ufeff!fav!:Favorite;\r\nTarget:123/A;Local;\r\nOther:OtherMod;\r\n';
  await fs.writeFile(cfg, original);
  await fs.writeFile(physicalFile, 'mods\n{\nmod=PhysicalMod,\n}\n');
  const local = new LocalLibrary({
    userDir: root,
    steamPath: path.join(root, 'steam'),
    isGameRunning: async () => running,
  });
  await local.init();
  const store = new LocalProfileStore();
  const library = new ProfileLibrary(local, store);
  const service = new ProfileService(library, store);
  const sources = await library.saves();
  const collection = sources.find((source) => source.name === 'Target')!;
  const physical = sources.find((source) => source.kind === 'save')!;
  const snapshot = await library.readSave(collection.id);
  return {
    root,
    cfg,
    original,
    physicalFile,
    local,
    library,
    service,
    collection,
    physical,
    snapshot,
  };
}

test('deletion by opaque collection source ID creates an exact backup outside Lua and preserves other profiles', async () => {
  const f = await fixture();
  try {
    const result = await f.service.delete(f.collection.id, f.snapshot.revision);
    assert.equal(result.deletedId, f.collection.id);
    assert.equal(
      path.dirname(result.backup),
      await fs.realpath(path.join(f.root, 'backups', 'pz-mods', 'profiles')),
    );
    assert.deepEqual(await fs.readFile(result.backup), Buffer.from(f.original, 'utf8'));
    assert.equal(
      await fs.readFile(f.cfg, 'utf8'),
      f.original.replace('Target:123/A;Local;\r\n', ''),
    );
    const sources = await f.library.saves();
    assert.ok(!sources.some((source) => source.id === f.collection.id));
    assert.ok(sources.some((source) => source.name === 'Other'));
    assert.deepEqual(await fs.readdir(path.dirname(f.cfg)), ['pz_modlist_settings.cfg']);
    await assert.rejects(f.service.delete(f.collection.id, f.snapshot.revision), /introuvable/);
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('physical saves, unknown IDs and stale revisions cannot delete a profile', async () => {
  const f = await fixture();
  try {
    const physical = await f.library.readSave(f.physical.id);
    await assert.rejects(
      f.service.delete(f.physical.id, physical.revision),
      /Seule une collection/,
    );
    await assert.rejects(
      f.service.delete('collection:' + 'a'.repeat(24), f.snapshot.revision),
      /introuvable/,
    );
    await assert.rejects(f.service.delete(f.collection.id, ''), /Requête/);
    const changed = f.original.replace('Other:OtherMod;', 'Other:Changed;');
    await fs.writeFile(f.cfg, changed);
    await assert.rejects(
      f.service.delete(f.collection.id, f.snapshot.revision),
      /profils a changé/,
    );
    assert.equal(await fs.readFile(f.cfg, 'utf8'), changed);
    assert.equal(await fs.readFile(f.physicalFile, 'utf8'), 'mods\n{\nmod=PhysicalMod,\n}\n');
    await assert.rejects(fs.stat(path.join(f.root, 'backups')));
    await fs.unlink(f.cfg);
    await assert.rejects(f.service.delete(f.collection.id, f.snapshot.revision), /introuvable/);
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('backup failure or a running game blocks deletion without changing the original profile file', async () => {
  for (const running of [false, true]) {
    const f = await fixture(running);
    try {
      if (!running) await fs.writeFile(path.join(f.root, 'backups'), 'not-a-directory');
      await assert.rejects(
        f.service.delete(f.collection.id, f.snapshot.revision),
        running ? /Ferme Project Zomboid/ : /Impossible d’enregistrer/,
      );
      assert.equal(await fs.readFile(f.cfg, 'utf8'), f.original);
      assert.deepEqual(await fs.readdir(path.dirname(f.cfg)), ['pz_modlist_settings.cfg']);
    } finally {
      await fs.rm(f.root, { recursive: true, force: true });
    }
  }
});
