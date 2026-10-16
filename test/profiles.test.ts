import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildProfileFragment, insertProfile, profileExists } from '../src/domain/profiles.js';
import { ProfileService } from '../src/application/profiles.js';
import { LocalProfileStore } from '../src/adapters/profile-store.js';
import { LocalLibrary } from '../src/adapters/local-library.js';

test('profile fragments remove initial backslashes only and deduplicate IDs in save order', () => {
  const profile = buildProfileFragment('  Été solo  ', [
    '\\123/Main',
    '\\456/Option',
    '123/Main',
    'Local',
  ]);
  assert.equal(profile.name, 'Été solo');
  assert.deepEqual(profile.ids, ['123/Main', '456/Option', 'Local']);
  assert.equal(profile.count, 3);
  assert.equal(profile.profileText, 'Été solo:123/Main;456/Option;Local;');
  assert.equal(profile.downloadText, '!fav!:\nÉté solo:123/Main;456/Option;Local;\n');
  const colon = buildProfileFragment('Fixture', ['Vehicle:Core']);
  assert.equal(colon.profileText, 'Fixture:Vehicle:Core;');
  const original = '!fav!:\nFixture:Vehicle:Old;\n';
  assert.equal(profileExists(original, true, 'Fixture'), true);
  assert.equal(insertProfile(original, true, colon, true), '!fav!:\nFixture:Vehicle:Core;\n');
});

test('profile validation rejects reserved names, delimiters, controls and invalid Unicode', () => {
  for (const name of [
    '',
    '!fav!reserved',
    '!FAV!',
    'bad:name',
    'bad/name',
    'bad\\name',
    'bad*name',
    'bad?name',
    'bad"name',
    'bad<name',
    'bad>name',
    'bad|name',
    'bad\nname',
    'x'.repeat(129),
    '\ud800',
  ])
    assert.throws(() => buildProfileFragment(name, ['A']), /Nom de profil/);
  for (const id of ['', 'A;B', 'A\nB', 'A\rB', 'A\tB', 'A\\B', '\ud800', 'A\u2028B'])
    assert.throws(() => buildProfileFragment('Fixture', [id]), /Identifiant/);
  assert.throws(() => buildProfileFragment('Fixture', Array(10001).fill('A')), /volumineuse/);
});

test('profile insertion preserves BOM, favorites, unknown lines, other profiles and CRLF', () => {
  const original =
    '\ufeff!fav!:123/Favorite;\r\nOther:OtherMod;\r\n# unknown untouched\r\nTarget:Old;\r\nLast:LastMod;';
  const target = buildProfileFragment('Target', ['\\456/New']);
  assert.equal(profileExists(original, true, 'Target'), true);
  assert.throws(() => insertProfile(original, true, target, false), /existe déjà/);
  assert.equal(
    insertProfile(original, true, target, true),
    original.replace('Target:Old;', 'Target:456/New;'),
  );
  assert.equal(
    insertProfile(original, true, buildProfileFragment('Added', ['A']), false),
    original + '\r\nAdded:A;\r\n',
  );
  assert.equal(profileExists('!fav!:\nTargetX\n', true, 'Target'), false);
  assert.throws(
    () => profileExists('!fav!:\nTarget:A;\nTarget:B;\n', true, 'Target'),
    /Plusieurs profils/,
  );
  assert.throws(() => insertProfile('Target:A;\n', true, target, false), /Format/);
  assert.equal(profileExists('', true, 'Target'), false);
});

async function fixture(running = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-profile-'));
  const saveFile = path.join(root, 'Saves', 'Sandbox', 'fixture', 'mods.txt');
  const profileFile = path.join(root, 'Lua', 'pz_modlist_settings.cfg');
  await fs.mkdir(path.dirname(saveFile), { recursive: true });
  await fs.writeFile(saveFile, 'mods\n{\nmod=\\123/A,\nmod=Local,\n}\n');
  const library = new LocalLibrary({
    userDir: root,
    steamPath: path.join(root, 'steam'),
    isGameRunning: async () => running,
  });
  await library.init();
  const [save] = await library.saves();
  const snapshot = await library.readSave(save.id);
  const store = new LocalProfileStore();
  const service = new ProfileService(library, store);
  return { root, saveFile, profileFile, library, save, snapshot, store, service };
}

test('profile preview is read-only and export creates Lua only under the configured existing user directory', async () => {
  const f = await fixture();
  try {
    const preview = await f.service.preview(f.save.id, f.snapshot.revision, 'Fixture');
    assert.equal(preview.exists, false);
    assert.equal(preview.count, 2);
    await assert.rejects(fs.stat(path.join(f.root, 'Lua')));
    const result = await f.service.export(
      f.save.id,
      f.snapshot.revision,
      'Fixture',
      preview.profileRevision,
      false,
    );
    assert.deepEqual(result, { created: true, replaced: false });
    assert.equal(await fs.readFile(f.profileFile, 'utf8'), '!fav!:\nFixture:123/A;Local;\n');
    const exported = await f.service.preview(f.save.id, f.snapshot.revision, 'Fixture');
    assert.equal(exported.exists, true);
    await assert.rejects(
      f.service.export(f.save.id, f.snapshot.revision, 'Fixture', exported.profileRevision, false),
      /existe déjà/,
    );
    const replacement = await f.service.export(
      f.save.id,
      f.snapshot.revision,
      'Fixture',
      exported.profileRevision,
      true,
    );
    assert.equal(replacement.created, false);
    assert.equal(replacement.replaced, true);
    assert.ok(replacement.backup);
    assert.equal(await fs.readFile(replacement.backup!, 'utf8'), '!fav!:\nFixture:123/A;Local;\n');
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('profile writes preserve original bytes in backup and do not export unrelated profile inventory', async () => {
  const f = await fixture();
  try {
    const original = '\ufeff!fav!:SecretFavorite;\r\nPrivateProfile:SecretMod;\r\n';
    await fs.mkdir(path.dirname(f.profileFile));
    await fs.writeFile(f.profileFile, original, 'utf8');
    const preview = await f.service.preview(f.save.id, f.snapshot.revision, 'Fixture');
    assert.doesNotMatch(JSON.stringify(preview), /Secret|PrivateProfile/);
    const result = await f.service.export(
      f.save.id,
      f.snapshot.revision,
      'Fixture',
      preview.profileRevision,
      false,
    );
    assert.equal(await fs.readFile(result.backup!, 'utf8'), original);
    assert.equal(await fs.readFile(f.profileFile, 'utf8'), original + 'Fixture:123/A;Local;\r\n');
    assert.deepEqual(
      (await fs.readdir(path.dirname(f.profileFile))).filter((name) => name.endsWith('.tmp')),
      [],
    );
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('both source and profile revisions and the destination path identity are checked', async () => {
  const f = await fixture();
  try {
    const preview = await f.service.preview(f.save.id, f.snapshot.revision, 'Fixture');
    await assert.rejects(
      f.service.export(f.save.id, 'stale', 'Fixture', preview.profileRevision, false),
      /sauvegarde a changé/,
    );
    await fs.mkdir(path.dirname(f.profileFile));
    await fs.writeFile(f.profileFile, '!fav!:\nOther:A;\n');
    await assert.rejects(
      f.service.export(f.save.id, f.snapshot.revision, 'Fixture', preview.profileRevision, false),
      /profils a changé/,
    );
    const current = await f.service.preview(f.save.id, f.snapshot.revision, 'Fixture');
    const other = path.join(f.root, 'other-user');
    await fs.mkdir(other);
    await fs.mkdir(path.join(other, 'Lua'));
    await fs.copyFile(f.profileFile, path.join(other, 'Lua', 'pz_modlist_settings.cfg'));
    assert.notEqual((await f.store.read(other)).revision, current.profileRevision);
    const changedSource = async () => {
      throw Error('Source changed');
    };
    await assert.rejects(
      f.store.write(f.root, current.profileRevision, '!fav!:\nFixture:A;\n', changedSource),
    );
    assert.equal(await fs.readFile(f.profileFile, 'utf8'), '!fav!:\nOther:A;\n');
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('running game and concurrent configuration or save writes are blocked by the shared mutation lock', async () => {
  const f = await fixture(true);
  try {
    const preview = await f.service.preview(f.save.id, f.snapshot.revision, 'Fixture');
    await assert.rejects(
      f.service.export(f.save.id, f.snapshot.revision, 'Fixture', preview.profileRevision, false),
      /Ferme Project Zomboid/,
    );
    await assert.rejects(fs.stat(f.profileFile));
    const idle = new LocalLibrary({
      userDir: f.root,
      steamPath: path.join(f.root, 'steam'),
      isGameRunning: async () => false,
    });
    await idle.init();
    await idle.saves();
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mutation = idle.withProfileMutation(async () => {
      entered();
      await pending;
    });
    await enteredPromise;
    await assert.rejects(idle.configure({}), /en cours/);
    await assert.rejects(idle.add(f.save.id, 'Extra', f.snapshot.revision), /en cours/);
    release();
    await mutation;
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('invalid existing UTF-8 is rejected and missing user directories are never created', async () => {
  const f = await fixture();
  try {
    await fs.mkdir(path.dirname(f.profileFile));
    await fs.writeFile(f.profileFile, Buffer.from([0xff, 0xfe, 0x41]));
    await assert.rejects(f.service.preview(f.save.id, f.snapshot.revision, 'Fixture'), /UTF-8/);
    const missing = path.join(f.root, 'missing-user');
    const snapshot = await f.store.read(missing);
    await assert.rejects(
      f.store.write(missing, snapshot.revision, '!fav!:\nFixture:A;\n', async () => {}),
    );
    await assert.rejects(fs.stat(missing));
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('empty and BOM-only existing files initialize the header and retain exact backups', async () => {
  for (const original of ['', '\ufeff']) {
    const f = await fixture();
    try {
      await fs.mkdir(path.dirname(f.profileFile));
      await fs.writeFile(f.profileFile, original, 'utf8');
      const preview = await f.service.preview(f.save.id, f.snapshot.revision, 'Fixture');
      assert.equal(preview.exists, false);
      const result = await f.service.export(
        f.save.id,
        f.snapshot.revision,
        'Fixture',
        preview.profileRevision,
        false,
      );
      assert.equal(await fs.readFile(result.backup!, 'utf8'), original);
      assert.equal(
        await fs.readFile(f.profileFile, 'utf8'),
        original + '!fav!:\nFixture:123/A;Local;\n',
      );
    } finally {
      await fs.rm(f.root, { recursive: true, force: true });
    }
  }
});

test('missing-file revisions detect retargeted user-directory junctions and escaped Lua directories are rejected', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-profile-link-'));
  try {
    const first = path.join(root, 'first');
    const second = path.join(root, 'second');
    const link = path.join(root, 'user');
    await fs.mkdir(first);
    await fs.mkdir(second);
    await fs.symlink(first, link, process.platform === 'win32' ? 'junction' : 'dir');
    const store = new LocalProfileStore();
    const before = await store.read(link);
    await fs.unlink(link);
    await fs.symlink(second, link, process.platform === 'win32' ? 'junction' : 'dir');
    const after = await store.read(link);
    assert.notEqual(after.revision, before.revision);
    await assert.rejects(
      store.write(link, before.revision, '!fav!:\nFixture:A;\n', async () => {}),
      /profils a changé/,
    );
    await assert.rejects(fs.stat(path.join(second, 'Lua')));
    const outside = path.join(root, 'outside');
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'pz_modlist_settings.cfg'), '!fav!:\nPrivate:Hidden;\n');
    const lua = path.join(first, 'Lua');
    await fs.symlink(outside, lua, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(store.read(first), /UTF-8 compatible/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
