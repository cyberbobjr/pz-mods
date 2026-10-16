import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { analyse, removalBlockers, type Mod } from '../src/domain/mods.js';
import { LocalLibrary, parseInfo, parseSave } from '../src/adapters/local-library.js';
import { SteamWorkshop } from '../src/adapters/steam.js';

const mod = (id: string, extra: Partial<Mod> = {}): Mod => ({
  id,
  name: id,
  description: '',
  requires: [],
  incompatible: [],
  variants: [],
  source: 'fixture',
  ...extra,
});

test('local development mods keep their origin in numeric and linked folders', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-mods-local-'));
  try {
    const userDir = path.join(root, 'user');
    const numericMod = path.join(userDir, 'mods', '123456', '42');
    const developmentMod = path.join(root, 'development', '42');
    await fs.mkdir(numericMod, { recursive: true });
    await fs.mkdir(developmentMod, { recursive: true });
    await fs.writeFile(path.join(numericMod, 'mod.info'), 'id=LocalNumeric\nname=Création locale');
    await fs.writeFile(path.join(developmentMod, 'mod.info'), 'id=LocalLinked');
    await fs.writeFile(path.join(userDir, 'version.txt'), '42.21.0');
    const workshopMod = path.join(
      userDir,
      'Workshop',
      'MyProject',
      'Contents',
      'mods',
      'MyMod',
      '42.21',
    );
    await fs.mkdir(workshopMod, { recursive: true });
    await fs.writeFile(
      path.join(workshopMod, 'mod.info'),
      'id=LocalWorkshop\nname=Projet local\nposter=poster.png',
    );
    await fs.writeFile(path.join(workshopMod, 'poster.png'), 'fixture');
    await fs.symlink(
      path.dirname(developmentMod),
      path.join(userDir, 'mods', 'Linked'),
      'junction',
    );
    const library = new LocalLibrary({ userDir, steamPath: path.join(root, 'steam') });
    await library.init();
    const mods = await library.scan();
    assert.equal(mods.length, 3);
    assert.equal(mods.find((m) => m.id === 'LocalNumeric')?.name, 'Création locale');
    assert.ok(mods.every((m) => m.workshopId === undefined));
    assert.ok(mods.find((m) => m.id === 'LocalWorkshop')?.image);
    assert.deepEqual(
      analyse(mods, ['LocalNumeric', 'LocalLinked', 'LocalWorkshop'], '42.21.0'),
      [],
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('save parser preserves qualified IDs and ignores empty mod lines', () => {
  assert.deepEqual(
    parseSave('mods\r\n{\r\n mod = \\123/Alpha,\r\n mod = ,\r\n mod = Beta,\r\n}\r\n'),
    ['\\123/Alpha', 'Beta'],
  );
  assert.equal(
    parseInfo('id=Alpha\ndescription=First\ndescription=Second').description,
    'First\nSecond',
  );
});

test('analysis distinguishes missing dependencies, incompatible mods and versions', () => {
  const mods = [
    mod('Alpha', {
      workshopId: '123',
      requires: ['Beta'],
      incompatible: ['Gamma'],
      versionMin: '42.14',
    }),
    mod('Beta'),
    mod('Gamma'),
  ];
  const issues = analyse(mods, ['\\123/Alpha', 'Gamma', 'Missing'], '42.13');
  assert.deepEqual(issues.map((issue) => issue.kind).sort(), [
    'dependency',
    'incompatible',
    'missing',
    'version',
  ]);
  assert.deepEqual(removalBlockers(mods, ['Alpha', 'Beta'], ['Beta']), ['Alpha']);
  assert.deepEqual(removalBlockers(mods, ['Alpha', 'Beta'], ['Alpha', 'Beta']), []);
});

test('qualified save identifiers select their Workshop provider', () => {
  const installed = [
    mod('Alpha', { workshopId: '111' }),
    mod('Alpha', { workshopId: '222', requires: ['Beta'] }),
  ];
  assert.equal(analyse(installed, ['\\222/Alpha'])[0]?.kind, 'dependency');
  assert.equal(analyse(installed, ['\\333/Alpha'])[0]?.kind, 'missing');
});

test('mutual incompatibility is reported once while separate pairs stay distinct', () => {
  const mods = [
    mod('Alpha', { incompatible: ['Beta', 'Beta', 'Gamma'] }),
    mod('Beta', { incompatible: ['Alpha'] }),
    mod('Gamma', { incompatible: ['Alpha'] }),
  ];
  const issues = analyse(mods, ['Alpha', 'Beta', 'Gamma']);
  assert.equal(issues.length, 2);
  assert.ok(issues.every((issue) => issue.kind === 'incompatible'));
  assert.deepEqual(
    issues.map((issue) => [issue.modId, issue.target]),
    [
      ['Alpha', 'Beta'],
      ['Alpha', 'Gamma'],
    ],
  );
});

test('temporary library selects B42 metadata and backs up safe removals', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-mods-test-'));
  try {
    const userDir = path.join(root, 'user');
    const saveDir = path.join(userDir, 'Saves', 'Sandbox', 'fixture');
    const modDir = path.join(userDir, 'mods', 'Example');
    const write = async (file: string, text: string) => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, text);
    };
    await write(path.join(userDir, 'version.txt'), '42.13.1');
    await write(path.join(modDir, 'common', 'mod.info'), 'id=Alpha\nname=Common');
    await write(path.join(modDir, '42.13', 'mod.info'), 'id=Alpha\nname=Selected');
    await write(path.join(modDir, '42.14', 'mod.info'), 'id=Alpha\nname=Future');
    await write(path.join(userDir, 'mods', 'Legacy', 'mod.info'), 'id=Legacy');
    const original = 'mods\r\n{\r\n mod = \\123/Alpha,\r\n mod = Beta,\r\n}\r\n';
    await write(path.join(saveDir, 'mods.txt'), original);
    const library = new LocalLibrary({
      userDir,
      steamPath: path.join(root, 'steam'),
      isGameRunning: async () => false,
    });
    await library.init();
    const [save] = await library.saves();
    const mods = await library.scan();
    assert.equal(mods.find((m) => m.id === 'Alpha')?.name, 'Selected');
    assert.equal(
      mods.find((m) => m.id === 'Alpha')?.metadataModifiedAt,
      (await fs.stat(path.join(modDir, '42.13', 'mod.info'))).mtime.toISOString(),
    );
    assert.equal(analyse(mods, ['Legacy'], '42.13')[0]?.kind, 'version');
    const snapshot = await library.readSave(save.id);
    await assert.rejects(library.remove(save.id, ['Alpha'], 'stale'), /changé/);
    const backup = await library.remove(save.id, ['Alpha'], snapshot.revision);
    assert.equal(await fs.readFile(backup, 'utf8'), original);
    assert.deepEqual(parseSave(await fs.readFile(path.join(saveDir, 'mods.txt'), 'utf8')), [
      'Beta',
    ]);
    await assert.rejects(library.remove(save.id, ['Beta'], snapshot.revision), /changé/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Workshop cache refreshes legacy entries and expires after six hours', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-workshop-test-'));
  try {
    const cacheFile = path.join(root, 'cache.json');
    let now = 1_800_000_000_000;
    let calls = 0;
    await fs.writeFile(
      cacheFile,
      JSON.stringify({ '123': { title: 'Old', description: '', preview_url: '' } }),
    );
    const request: typeof fetch = async () => {
      calls++;
      return new Response(
        JSON.stringify({
          response: {
            publishedfiledetails: [
              {
                publishedfileid: '123',
                result: 1,
                title: 'Updated',
                description: 'Description',
                preview_url: 'https://example.com/image.png',
                time_updated: 1_700_000_000,
              },
            ],
          },
        }),
      );
    };
    const workshop = new SteamWorkshop({ cacheFile, fetch: request, now: () => now });
    const first = await workshop.details(['123']);
    assert.equal(calls, 1);
    assert.equal(first['123'].time_updated, 1_700_000_000);
    assert.equal(first['123'].fetchedAt, now);
    await workshop.details(['123']);
    assert.equal(calls, 1);
    const reloaded = new SteamWorkshop({ cacheFile, fetch: request, now: () => now });
    await reloaded.details(['123']);
    assert.equal(calls, 1);
    now += 6 * 60 * 60 * 1000;
    await reloaded.details(['123']);
    assert.equal(calls, 2);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
