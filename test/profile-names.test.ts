import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { renameProfile, duplicateProfile } from '../src/domain/profiles.js';
import { ProfileService, type ProfileStorePort } from '../src/application/profiles.js';
import { LocalLibrary } from '../src/adapters/local-library.js';
import { ProfileLibrary } from '../src/adapters/profile-library.js';
import { LocalProfileStore } from '../src/adapters/profile-store.js';

const original =
  '\ufeff!fav!:Favorite;\r\nTarget: 123/A;\\456/B;123/A;Vehicle:Core;  \r\n# unknown line\r\nOther:OtherMod;';

test('renaming changes only the exact name and preserves raw ID payloads, order, duplicates and line endings', () => {
  assert.equal(
    renameProfile(original, true, 'Target', '  Été renommé  '),
    original.replace('Target:', 'Été renommé:'),
  );
  assert.equal(renameProfile(original, true, 'Other', 'Last'), original.replace('Other:', 'Last:'));
  assert.equal(
    renameProfile('\ufeff!fav!:\r\nSource:Véhicule:Été;', true, 'Source', 'Copie'),
    '\ufeff!fav!:\r\nCopie:Véhicule:Été;',
  );
  assert.throws(() => renameProfile(original, true, 'Target', 'Target'), /différent/);
  assert.throws(() => renameProfile(original, true, 'Target', 'Other'), /déjà ce nom/);
  assert.throws(() => renameProfile(original, true, '!fav!', 'Renamed'), /Nom de profil/);
  assert.throws(() => renameProfile(original, true, 'Absent', 'Renamed'), /introuvable/);
  assert.throws(() => renameProfile(original, true, 'Target', 'bad:name'), /Nom de profil/);
});

test('duplication appends the exact raw ID payload without modifying the source or any other bytes', () => {
  const raw = ' 123/A;\\456/B;123/A;Vehicle:Core;  ';
  assert.equal(
    duplicateProfile(original, true, 'Target', '  Copie été  '),
    original + '\r\nCopie été:' + raw + '\r\n',
  );
  assert.equal(
    duplicateProfile('!fav!:\nLast:123/A;Local;', true, 'Last', 'Copy'),
    '!fav!:\nLast:123/A;Local;\nCopy:123/A;Local;\n',
  );
  for (const name of ['Target', 'Other'])
    assert.throws(() => duplicateProfile(original, true, 'Target', name), /déjà ce nom/);
  assert.throws(() => duplicateProfile(original, true, 'Absent', 'Copy'), /introuvable/);
  assert.equal(
    duplicateProfile(original, true, 'Other', 'Last copy'),
    original + '\r\nLast copy:OtherMod;\r\n',
  );
});

async function fixture(running = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-profile-names-'));
  const cfg = path.join(root, 'Lua', 'pz_modlist_settings.cfg');
  await fs.mkdir(path.dirname(cfg), { recursive: true });
  await fs.writeFile(cfg, original);
  const physical = path.join(root, 'Saves', 'Sandbox', 'Physical', 'mods.txt');
  await fs.mkdir(path.dirname(physical), { recursive: true });
  await fs.writeFile(physical, 'mods\n{\nmod=A,\n}\n');
  const local = new LocalLibrary({
    userDir: root,
    steamPath: path.join(root, 'steam'),
    isGameRunning: async () => running,
  });
  await local.init();
  const store = new LocalProfileStore();
  const library = new ProfileLibrary(local, store);
  const service = new ProfileService(library, store, library);
  const sources = await library.saves();
  const target = sources.find((source) => source.name === 'Target')!;
  const physicalSource = sources.find((source) => source.kind === 'save')!;
  const snapshot = await library.readSave(target.id);
  return { root, cfg, store, library, service, target, physicalSource, snapshot };
}

test('renaming and duplicating use stable new IDs, exact backups and no reads after successful writes', async () => {
  for (const action of ['rename', 'duplicate'] as const) {
    const f = await fixture();
    try {
      let committed = false;
      const guardedStore: ProfileStorePort = {
        read: async (userDir) => {
          assert.equal(committed, false, 'No read after commit');
          return f.store.read(userDir);
        },
        write: async (...args) => {
          const result = await f.store.write(...args);
          committed = true;
          return result;
        },
      };
      const service = new ProfileService(f.library, guardedStore, f.library);
      const result = await service[action](f.target.id, f.snapshot.revision, '  Nouveau  ');
      assert.equal(result.name, 'Nouveau');
      assert.match(result.sourceId, /^collection:[a-f0-9]{24}$/);
      assert.notEqual(result.sourceId, f.target.id);
      assert.deepEqual(await fs.readFile(result.backup), Buffer.from(original, 'utf8'));
      const expected =
        action === 'rename'
          ? renameProfile(original, true, 'Target', 'Nouveau')
          : duplicateProfile(original, true, 'Target', 'Nouveau');
      assert.equal(await fs.readFile(f.cfg, 'utf8'), expected);
      assert.equal(
        (await f.library.saves()).find((source) => source.name === 'Nouveau')?.id,
        result.sourceId,
      );
      assert.equal(
        (await f.library.saves()).some((source) => source.id === f.target.id),
        action === 'duplicate',
      );
      assert.deepEqual(await fs.readdir(path.dirname(f.cfg)), ['pz_modlist_settings.cfg']);
    } finally {
      await fs.rm(f.root, { recursive: true, force: true });
    }
  }
});

test('collisions, unchanged rename, stale revisions and physical saves do not create backups or mutate profiles', async () => {
  const f = await fixture();
  try {
    for (const action of ['rename', 'duplicate'] as const) {
      await assert.rejects(
        f.service[action](f.target.id, f.snapshot.revision, 'Other'),
        /déjà ce nom/,
      );
      await assert.rejects(
        f.service[action](f.physicalSource.id, f.snapshot.revision, 'Copy'),
        /Seule une collection/,
      );
      await assert.rejects(f.service[action](f.target.id, 'stale', 'Copy'), /profils a changé/);
      await assert.rejects(
        f.service[action]('collection:' + '0'.repeat(24), f.snapshot.revision, 'Copy'),
        /introuvable/,
      );
    }
    await assert.rejects(f.service.rename(f.target.id, f.snapshot.revision, 'Target'), /différent/);
    await assert.rejects(
      f.service.rename(f.target.id, f.snapshot.revision, '  Target  '),
      /différent/,
    );
    assert.equal(await fs.readFile(f.cfg, 'utf8'), original);
    await assert.rejects(fs.stat(path.join(f.root, 'backups')));
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('both collection name actions require the game closed and a successful backup', async () => {
  for (const running of [false, true]) {
    const f = await fixture(running);
    try {
      if (!running) await fs.writeFile(path.join(f.root, 'backups'), 'not-a-directory');
      for (const action of ['rename', 'duplicate'] as const) {
        await assert.rejects(
          f.service[action](f.target.id, f.snapshot.revision, 'Copy'),
          running ? /Ferme Project Zomboid/ : /Impossible d’enregistrer/,
        );
      }
      assert.equal(await fs.readFile(f.cfg, 'utf8'), original);
    } finally {
      await fs.rm(f.root, { recursive: true, force: true });
    }
  }
});
