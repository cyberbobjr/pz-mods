import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { ProfileStorePort } from '../application/profiles.js';

const MAX_PROFILE_BYTES = 8 * 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const fileFor = (userDir: string) => path.resolve(userDir, 'Lua', 'pz_modlist_settings.cfg');
const revisionFor = (file: string, identity: string, bytes: Uint8Array) =>
  createHash('sha256')
    .update(file)
    .update('\0' + identity + '\0')
    .update(bytes)
    .digest('hex');

export class LocalProfileStore implements ProfileStorePort {
  private async rootIdentity(userDir: string) {
    try {
      const actual = await fs.realpath(userDir);
      const stat = await fs.stat(actual);
      if (!stat.isDirectory()) throw Error('unsupported');
      return JSON.stringify([actual, stat.dev, stat.ino]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing-root';
      throw error;
    }
  }
  private async validateLuaLocation(userDir: string) {
    const root = await fs.realpath(userDir);
    const lua = await fs.realpath(path.join(userDir, 'Lua'));
    const relative = path.relative(root, lua);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('unsupported');
  }
  async read(userDir: string) {
    const file = fileFor(userDir);
    let rootIdentity = '';
    try {
      rootIdentity = await this.rootIdentity(userDir);
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.size > MAX_PROFILE_BYTES) throw Error('unsupported');
      await this.validateLuaLocation(userDir);
      const bytes = await fs.readFile(file);
      if (bytes.length > MAX_PROFILE_BYTES) throw Error('unsupported');
      const text = decoder.decode(bytes);
      const identity = `${rootIdentity}:${stat.dev}:${stat.ino}:${stat.mtimeMs}:${stat.ctimeMs}`;
      return { text, exists: true, revision: revisionFor(file, identity, bytes) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return {
          text: '',
          exists: false,
          revision: revisionFor(file, `${rootIdentity}:missing`, new Uint8Array()),
        };
      throw Error('Impossible de lire le fichier de profils dans un format UTF-8 compatible.', {
        cause: error,
      });
    }
  }
  private async prepareDirectory(userDir: string) {
    const root = await fs.realpath(userDir);
    if (!(await fs.stat(root)).isDirectory()) throw Error('unsupported');
    const lua = path.join(root, 'Lua');
    await fs.mkdir(lua).catch(async (error) => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    });
    const actual = await fs.realpath(lua);
    const relative = path.relative(root, actual);
    if (
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      !(await fs.stat(actual)).isDirectory()
    )
      throw Error('unsupported');
  }
  async write(
    userDir: string,
    revision: string,
    text: string,
    validateSource: () => Promise<void>,
  ) {
    const file = fileFor(userDir);
    const temporary = `${file}.${randomUUID()}.tmp`;
    let backup: string | undefined;
    try {
      if (Buffer.byteLength(text, 'utf8') > MAX_PROFILE_BYTES) throw Error('unsupported');
      const current = await this.read(userDir);
      if (current.revision !== revision) throw Error('concurrent');
      await this.prepareDirectory(userDir);
      if ((await this.read(userDir)).revision !== revision) throw Error('concurrent');
      if (current.exists) {
        backup = `${file}.pz-mods-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.bak`;
        await fs.copyFile(file, backup, fs.constants.COPYFILE_EXCL);
      }
      await fs.writeFile(temporary, text, { encoding: 'utf8', flag: 'wx' });
      await validateSource();
      if ((await this.read(userDir)).revision !== revision) throw Error('concurrent');
      await fs.rename(temporary, file);
      return backup ? { backup } : {};
    } catch (error) {
      if (error instanceof Error && error.message === 'concurrent')
        throw Error('Le fichier de profils a changé. Vérifie à nouveau l’aperçu.', {
          cause: error,
        });
      throw Error(
        'Impossible d’enregistrer le profil. Vérifie les chemins et actualise l’aperçu.',
        { cause: error },
      );
    } finally {
      await fs.unlink(temporary).catch(() => {});
    }
  }
}
