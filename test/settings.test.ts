import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalLibrary } from '../src/adapters/local-library.js';
import { SettingsStore } from '../src/adapters/settings-store.js';
import { SettingsService } from '../src/application/settings.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-settings-'));
  const userDir = path.join(root, 'user');
  const steamPath = path.join(root, 'steam');
  await fs.mkdir(userDir, { recursive: true });
  await fs.mkdir(steamPath, { recursive: true });
  const library = new LocalLibrary({ userDir, steamPath, isGameRunning: async () => false });
  await library.init();
  const store = new SettingsStore(path.join(root, 'cache', 'settings.json'));
  const service = new SettingsService(store, library);
  const write = async (file: string, text: string) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text);
  };
  return { root, userDir, steamPath, library, store, service, write };
}

test('settings persist valid paths atomically and reset to automatic defaults', async () => {
  const f = await fixture();
  try {
    const custom = path.join(f.root, 'custom');
    await fs.mkdir(custom);
    const updated = await f.service.update({
      savesDir: custom,
      localModsDirs: [],
      workshopDirs: [],
    });
    assert.equal(updated.paths.savesDir, custom);
    assert.deepEqual(updated.paths.localModsDirs, []);
    assert.deepEqual(await f.store.load(), updated.overrides);
    assert.deepEqual(await fs.readdir(path.join(f.root, 'cache')), ['settings.json']);
    const reset = await f.service.update({});
    assert.equal(reset.paths.userDir, f.userDir);
    assert.equal(reset.paths.steamPath, f.steamPath);
    assert.equal(reset.paths.savesDir, path.join(f.userDir, 'Saves'));
    assert.deepEqual(reset.paths.localModsDirs, [path.join(f.userDir, 'mods')]);
    assert.deepEqual(reset.overrides, {});
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('settings validation rejects missing, relative and malformed paths without persisting or echoing input', async () => {
  const f = await fixture();
  try {
    const original = await f.library.settings();
    for (const value of [
      { userDir: 'relative-private-folder' },
      { steamPath: path.join(f.root, 'missing-private-folder') },
      { localModsDirs: [''] },
      { unknown: 'private' },
      null,
    ]) {
      await assert.rejects(
        f.service.update(value),
        (error) => error instanceof Error && !/private|pz-settings-/.test(error.message),
      );
    }
    assert.deepEqual(await f.library.settings(), original);
    assert.deepEqual(await f.store.load(), {});
    await assert.rejects(fs.stat(path.join(f.root, 'cache', 'settings.json')));
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('custom roots rescan mods, retain development projects and invalidate previous save IDs', async () => {
  const f = await fixture();
  try {
    const originalSave = path.join(f.userDir, 'Saves', 'Sandbox', 'old', 'mods.txt');
    await f.write(originalSave, 'mod=Original,\n');
    await f.write(path.join(f.userDir, 'mods', 'Original', 'mod.info'), 'id=Original');
    await f.write(
      path.join(f.userDir, 'Workshop', 'Project', 'Contents', 'mods', 'Development', 'mod.info'),
      'id=Development',
    );
    const [oldSave] = await f.library.saves();
    assert.equal((await f.library.scan()).length, 2);
    const savesDir = path.join(f.root, 'saves');
    const locals = path.join(f.root, 'locals');
    const workshop = path.join(f.root, 'workshop');
    await f.write(path.join(savesDir, 'Sandbox', 'new', 'mods.txt'), 'mod=Custom,\n');
    await f.write(path.join(locals, 'Custom', 'mod.info'), 'id=Custom');
    await f.write(path.join(workshop, '123', 'mods', 'Remote', 'mod.info'), 'id=Remote');
    await f.service.update({ savesDir, localModsDirs: [locals], workshopDirs: [workshop] });
    await assert.rejects(f.library.readSave(oldSave.id), /inconnue/);
    assert.deepEqual((await f.library.scan()).map((mod) => mod.id).sort(), [
      'Custom',
      'Development',
      'Remote',
    ]);
    assert.equal((await f.library.scan()).find((mod) => mod.id === 'Remote')?.workshopId, '123');
    assert.equal((await f.library.saves())[0].name, 'new');
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('persistence failure keeps the current live configuration and settings', async () => {
  const f = await fixture();
  try {
    const custom = path.join(f.root, 'custom');
    await fs.mkdir(custom);
    const before = await f.library.settings();
    const service = new SettingsService(
      {
        load: async () => ({}),
        save: async () => {
          throw Error('Fixture write failure');
        },
      },
      f.library,
    );
    await assert.rejects(service.update({ userDir: custom }), /Impossible d’enregistrer/);
    assert.deepEqual(await f.library.settings(), before);
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('configuration is blocked during save mutations and save writes are blocked during configuration commits', async () => {
  const f = await fixture();
  try {
    await f.write(
      path.join(f.userDir, 'Saves', 'Sandbox', 'fixture', 'mods.txt'),
      'mod=A,\nmod=B,\n',
    );
    const [save] = await f.library.saves();
    const snapshot = await f.library.readSave(save.id);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const configuring = f.library.configure({}, () => pending);
    await assert.rejects(f.library.remove(save.id, ['A'], snapshot.revision), /chemins/);
    release();
    await configuring;
    let releaseGame!: () => void;
    const gamePending = new Promise<void>((resolve) => {
      releaseGame = resolve;
    });
    const mutating = new LocalLibrary({
      userDir: f.userDir,
      steamPath: f.steamPath,
      isGameRunning: async () => {
        await gamePending;
        return false;
      },
    });
    await mutating.init();
    await mutating.saves();
    const removal = mutating.remove(save.id, ['A'], snapshot.revision);
    await assert.rejects(mutating.configure({}), /en cours/);
    releaseGame();
    await removal;
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('invalid saved settings fall back to defaults on initialization', async () => {
  const f = await fixture();
  try {
    await f.write(path.join(f.root, 'cache', 'settings.json'), '{invalid');
    await f.service.initialize();
    assert.deepEqual((await f.service.get()).overrides, {});
    await f.store.save({ userDir: path.join(f.root, 'deleted') });
    await f.service.initialize();
    assert.equal((await f.service.get()).paths.userDir, f.userDir);
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});
