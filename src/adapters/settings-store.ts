import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SettingsStorePort } from '../application/settings.js';
import { parsePathOverrides, type PathOverrides } from '../domain/settings.js';

export class SettingsStore implements SettingsStorePort {
  constructor(private readonly file: string) {}
  async load() {
    try {
      return parsePathOverrides(JSON.parse(await fs.readFile(this.file, 'utf8')));
    } catch {
      return {};
    }
  }
  async save(paths: PathOverrides) {
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.writeFile(temporary, JSON.stringify(parsePathOverrides(paths)), { flag: 'wx' });
      await fs.rename(temporary, this.file);
    } catch {
      throw Error('Impossible d’enregistrer la configuration des chemins.');
    } finally {
      await fs.unlink(temporary).catch(() => {});
    }
  }
}
