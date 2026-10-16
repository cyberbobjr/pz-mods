import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ExplorerService } from '../src/application/explorer.js';
import { LocalLibrary } from '../src/adapters/local-library.js';

test('Explorer service only opens a known opaque directory key through its port', async () => {
  const key = 'a'.repeat(24);
  const opened: string[] = [];
  const resolved: string[] = [];
  const service = new ExplorerService(
    {
      resolveModDirectory: async (value) => {
        resolved.push(value);
        return value === key ? 'fixture-directory' : undefined;
      },
    },
    {
      open: async (directory) => {
        opened.push(directory);
      },
    },
  );
  for (const value of [undefined, '', '../private', 'C:\\private', 'a'.repeat(25), 'b'.repeat(24)])
    await assert.rejects(service.openModFolder(value), /Dossier de mod introuvable/);
  assert.deepEqual(opened, []);
  assert.deepEqual(resolved, ['b'.repeat(24)]);
  assert.deepEqual(await service.openModFolder(key), { opened: true });
  assert.deepEqual(opened, ['fixture-directory']);
});

test('folder keys resolve mod roots above B42/common and are invalidated with scans and configuration', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-explorer-'));
  try {
    const write = async (file: string, text: string) => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, text);
    };
    const versioned = path.join(root, 'mods', 'Versioned');
    const common = path.join(root, 'mods', 'Common');
    const development = path.join(root, 'Workshop', 'Project', 'Contents', 'mods', 'Development');
    await write(path.join(versioned, '42', 'mod.info'), 'id=Versioned');
    await write(path.join(common, 'common', 'mod.info'), 'id=Common');
    await write(path.join(development, '42', 'mod.info'), 'id=Development');
    const library = new LocalLibrary({ userDir: root, steamPath: path.join(root, 'steam') });
    await library.init();
    const mods = await library.scan('42.13');
    for (const [id, folder] of [
      ['Versioned', versioned],
      ['Common', common],
      ['Development', development],
    ]) {
      const mod = mods.find((mod) => mod.id === id);
      assert.match(mod?.folderKey || '', /^[a-f0-9]{24}$/);
      assert.equal(await library.resolveModDirectory(mod!.folderKey!), await fs.realpath(folder));
    }
    const versionedKey = mods.find((mod) => mod.id === 'Versioned')!.folderKey!;
    await fs.rm(versioned, { recursive: true });
    assert.equal(await library.resolveModDirectory(versionedKey), undefined);
    assert.equal(await library.resolveModDirectory(root), undefined);
    await library.scan('42.13', true);
    assert.equal(await library.resolveModDirectory(versionedKey), undefined);
    const commonKey = mods.find((mod) => mod.id === 'Common')!.folderKey!;
    await library.configure({});
    assert.equal(await library.resolveModDirectory(commonKey), undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('linked workspace mods resolve their trusted workspace root and reject retargeted links', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-explorer-link-'));
  try {
    const workspace = path.join(root, 'workspace');
    const other = path.join(root, 'other');
    const modsRoot = path.join(root, 'user', 'mods');
    await fs.mkdir(path.join(workspace, '42'), { recursive: true });
    await fs.writeFile(path.join(workspace, '42', 'mod.info'), 'id=Linked');
    await fs.mkdir(other);
    await fs.mkdir(modsRoot, { recursive: true });
    const link = path.join(modsRoot, 'Linked');
    await fs.symlink(workspace, link, process.platform === 'win32' ? 'junction' : 'dir');
    const library = new LocalLibrary({
      userDir: path.join(root, 'user'),
      steamPath: path.join(root, 'steam'),
    });
    await library.init();
    const [mod] = await library.scan('42.13');
    assert.equal(await library.resolveModDirectory(mod.folderKey!), await fs.realpath(workspace));
    await fs.unlink(link);
    await fs.symlink(other, link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(await library.resolveModDirectory(mod.folderKey!), undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
