import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { previewAddition } from '../src/domain/additions.js';
import type { Mod } from '../src/domain/mods.js';
import { LocalLibrary } from '../src/adapters/local-library.js';
import { ModService } from '../src/application/service.js';

const mod = (id: string, extra: Partial<Mod> = {}): Mod => ({
  id,
  name: id,
  description: '',
  source: 'fixture',
  requires: [],
  incompatible: [],
  variants: [],
  ...extra,
});

test('addition preview preserves provider conventions and rejects ambiguous unqualified IDs', () => {
  const installed = [
    mod('A', { workshopId: '123' }),
    mod('A', { workshopId: '456' }),
    mod('B', { workshopId: '789' }),
    mod('B', { workshopId: '789' }),
    mod('Local'),
  ];
  assert.throws(() => previewAddition(installed, [], 'A'), /ambigu/);
  assert.throws(
    () => previewAddition([mod('A'), mod('A', { workshopId: '123' })], [], 'A'),
    /ambigu/,
  );
  assert.equal(previewAddition(installed, ['\\123/A'], 'B').id, '\\789/B');
  assert.equal(previewAddition(installed, ['123/A'], 'B').id, '789/B');
  assert.equal(previewAddition(installed, ['A'], 'B').id, 'B');
  assert.equal(previewAddition(installed, ['\\123/A'], 'Local').id, 'Local');
  assert.equal(previewAddition(installed, [], '\\456/A').missing, false);
  assert.equal(previewAddition(installed, [], '\\999/A').missing, true);
  assert.equal(previewAddition(installed, ['\\456/A'], '\\123/A').alreadyActive, false);
  assert.equal(previewAddition(installed, ['\\456/A'], '\\456/A').alreadyActive, true);
  assert.equal(previewAddition([], ['\\999/Missing'], 'Missing').alreadyActive, true);
});

test('addition preview warns about unknown mods, missing prerequisites and order constraints without adding dependencies', () => {
  const missing = previewAddition([], ['Existing'], '  Unknown  ');
  assert.equal(missing.missing, true);
  assert.deepEqual(missing.ids, ['Existing', 'Unknown']);
  assert.ok(missing.issues.some((issue) => issue.kind === 'missing' && issue.modId === 'Unknown'));
  const result = previewAddition(
    [mod('New', { requires: ['Absent'], loadBefore: ['Existing'] }), mod('Existing')],
    ['Existing'],
    'New',
  );
  assert.deepEqual(result.ids, ['Existing', 'New']);
  assert.ok(result.issues.some((issue) => issue.kind === 'dependency'));
  assert.equal(result.orderViolations[0]?.kind, 'before');
  for (const id of [
    '',
    'A\nB',
    'A\rB',
    'A\tB',
    'A;B',
    'A,B',
    'A{B',
    'A}B',
    'A=B',
    'x'.repeat(513),
    '\\0/A',
  ])
    assert.throws(() => previewAddition([], [], id), /invalide/);
  assert.throws(
    () => previewAddition([], Array(10000).fill('Existing'), 'Unknown'),
    /trop de mods/,
  );
});

async function fixture(original: string, running = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-add-'));
  const file = path.join(root, 'Saves', 'Sandbox', 'fixture', 'mods.txt');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, original);
  const library = new LocalLibrary({
    userDir: root,
    steamPath: path.join(root, 'steam'),
    isGameRunning: async () => running,
  });
  await library.init();
  const [save] = await library.saves();
  const service = new ModService(
    library,
    { details: async () => ({}) },
    { get: async () => undefined },
  );
  return { root, file, library, save, service };
}

test('validated append preserves CRLF, comments, maps, qualifiers and original backup; duplicates do not write', async () => {
  const original =
    'VERSION=1\r\nmods\r\n{\r\n  mod = \\123/Existing,\r\n  # keep comment\r\n  maps = MapOne,MapTwo,\r\n}\r\n# after\r\n';
  const f = await fixture(original);
  try {
    const snapshot = await f.library.readSave(f.save.id);
    const preview = await f.service.validateAdd(f.save.id, 'Unknown', snapshot.revision);
    assert.equal(preview.missing, true);
    assert.equal(await fs.readFile(f.file, 'utf8'), original);
    const result = await f.service.add(f.save.id, 'Unknown', snapshot.revision);
    assert.equal(result.alreadyActive, false);
    assert.equal(await fs.readFile(result.backup!, 'utf8'), original);
    assert.equal(
      await fs.readFile(f.file, 'utf8'),
      original.replace('}\r\n', '  mod = Unknown,\r\n}\r\n'),
    );
    await assert.rejects(f.service.add(f.save.id, 'Other', snapshot.revision), /changé/);
    const current = await f.library.readSave(f.save.id);
    const before = await fs.readdir(path.dirname(f.file));
    const duplicate = await f.service.add(f.save.id, 'Unknown', current.revision);
    assert.equal(duplicate.alreadyActive, true);
    assert.equal('backup' in duplicate, false);
    assert.deepEqual(await fs.readdir(path.dirname(f.file)), before);
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('empty mod blocks support append while unsupported structures and running game block writes', async () => {
  for (const [original, running, accepted] of [
    ['mods\n{\n}\n', false, true],
    ['mod=A,\n', false, false],
    ['mods\n{\n}\nmods\n{\n}\n', false, false],
    ['mods\n{\n}\n', true, false],
  ] as const) {
    const f = await fixture(original, running);
    try {
      const snapshot = await f.library.readSave(f.save.id);
      if (accepted) {
        await f.library.add(f.save.id, 'Unknown', snapshot.revision);
        assert.equal(await fs.readFile(f.file, 'utf8'), 'mods\n{\n\tmod = Unknown,\n}\n');
      } else {
        await assert.rejects(f.library.add(f.save.id, 'Unknown', snapshot.revision));
        assert.equal(await fs.readFile(f.file, 'utf8'), original);
        assert.deepEqual(await fs.readdir(path.dirname(f.file)), ['mods.txt']);
      }
    } finally {
      await fs.rm(f.root, { recursive: true, force: true });
    }
  }
});

test('forced scan bypasses the inventory cache after a mod is removed on disk', async () => {
  const f = await fixture('mods\n{\n}\n');
  try {
    const info = path.join(f.root, 'mods', 'Fixture', 'mod.info');
    await fs.mkdir(path.dirname(info), { recursive: true });
    await fs.writeFile(info, 'id=Fixture');
    assert.equal((await f.library.scan()).length, 1);
    await fs.unlink(info);
    assert.equal((await f.library.scan()).length, 1);
    assert.equal((await f.library.scan(undefined, true)).length, 0);
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('concurrent additions are rejected while the first guarded write is pending', async () => {
  const f = await fixture('mods\n{\n}\n');
  try {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const library = new LocalLibrary({
      userDir: f.root,
      steamPath: path.join(f.root, 'steam'),
      isGameRunning: async () => {
        await pending;
        return false;
      },
    });
    await library.init();
    await library.saves();
    const snapshot = await library.readSave(f.save.id);
    const first = library.add(f.save.id, 'First', snapshot.revision);
    await assert.rejects(library.add(f.save.id, 'Second', snapshot.revision), /en cours/);
    release();
    await first;
    assert.deepEqual((await library.readSave(f.save.id)).ids, ['First']);
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});
