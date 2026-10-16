import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { LibraryPort } from '../application/service.js';
import {
  compareVersion,
  normalize,
  isExactPermutation,
  type Mod,
  type Save,
} from '../domain/mods.js';
const run = promisify(execFile);
const read = async (p: string) => fs.readFile(p, 'utf8').catch(() => '');
const entries = async (p: string) => fs.readdir(p, { withFileTypes: true }).catch(() => []);
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export const parseSave = (s: string) =>
  [...s.matchAll(/^[\t ]*mod[\t ]*=[\t ]*([^,\r\n]+?)[\t ]*,?[\t ]*\r?$/gm)]
    .map((m) => m[1].replace(/,$/, '').trim())
    .filter(Boolean);
export function parseInfo(text: string) {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([^=#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim().toLowerCase();
      values[key] = values[key] ? values[key] + '\n' + match[2].trim() : match[2].trim();
    }
  }
  return values;
}
const list = (s = '') =>
  s
    .split(/[;,\n]/)
    .map(normalize)
    .filter(Boolean);
export interface LocalLibraryOptions {
  userDir?: string;
  steamPath?: string;
  isGameRunning?: () => Promise<boolean>;
}

async function isGameRunning() {
  const processes = await run('tasklist', ['/FO', 'CSV', '/NH']);
  return /"ProjectZomboid[^"\r\n]*\.exe"/i.test(processes.stdout);
}

export class LocalLibrary implements LibraryPort {
  private readonly root: string;
  constructor(private readonly options: LocalLibraryOptions = {}) {
    this.root = options.userDir || process.env.PZ_USER_DIR || path.join(os.homedir(), 'Zomboid');
  }
  private libraries: string[] = [];
  private images = new Map<string, string>();
  private savePaths = new Map<string, string>();
  private busy = false;
  private gameVersion = '';
  private scanned: Mod[] = [];
  private scannedVersion = '';
  private scannedAt = 0;
  async init() {
    const steam =
      this.options.steamPath || process.env.STEAM_PATH || 'C:/Program Files (x86)/Steam';
    const vdf = await read(path.join(steam, 'steamapps/libraryfolders.vdf'));
    this.libraries = [
      ...new Set([
        steam,
        ...[...vdf.matchAll(/"path"\s+"([^"]+)"/g)].map((m) => m[1].replace(/\\\\/g, '\\')),
      ]),
    ];
    this.gameVersion =
      (await read(path.join(this.root, 'version.txt'))).match(/\d+\.\d+(?:\.\d+)?/)?.[0] || '';
  }
  async status() {
    return {
      userDir: this.root,
      workshopRoots: this.libraries.map((l) => path.join(l, 'steamapps/workshop/content/108600')),
      gameVersion: this.gameVersion,
      unsubscribe: 'workshop-page',
      analysis:
        'Métadonnées mod.info, prérequis, incompatibilités déclarées, versions et doublons. Les conflits Lua, cartes et contenus non déclarés ne sont pas détectés.',
    };
  }
  async saves() {
    const result: Save[] = [];
    this.savePaths.clear();
    for (const mode of await entries(path.join(this.root, 'Saves'))) {
      if (!mode.isDirectory() || mode.name.toLowerCase() === 'multiplayer') continue;
      for (const dir of await entries(path.join(this.root, 'Saves', mode.name))) {
        if (!dir.isDirectory()) continue;
        const full = path.join(this.root, 'Saves', mode.name, dir.name);
        const stat = await fs.stat(path.join(full, 'mods.txt')).catch(() => null);
        if (!stat) continue;
        const id = hash(full).slice(0, 24);
        this.savePaths.set(id, full);
        result.push({
          id,
          name: dir.name,
          mode: mode.name,
          modified: stat.mtime.toISOString(),
        });
      }
    }
    return result.sort((a, b) => b.modified.localeCompare(a.modified));
  }
  private savePath(id: string) {
    const p = this.savePaths.get(id);
    if (!p) throw Error('Sauvegarde inconnue. Actualise la liste.');
    return p;
  }
  async readSave(id: string) {
    const p = this.savePath(id);
    const text = await fs.readFile(path.join(p, 'mods.txt'), 'utf8');
    return {
      ids: parseSave(text),
      revision: hash(text),
      version: this.gameVersion || undefined,
    };
  }
  async scan(version = this.gameVersion) {
    if (this.scannedVersion === version && Date.now() - this.scannedAt < 30000) return this.scanned;
    const mods: Mod[] = [];
    this.images.clear();
    const roots = [
      { folder: path.join(this.root, 'mods'), workshop: false, development: false },
      { folder: path.join(this.root, 'Workshop'), workshop: false, development: true },
      ...this.libraries.map((l) => ({
        folder: path.join(l, 'steamapps/workshop/content/108600'),
        workshop: true,
        development: false,
      })),
    ];
    for (const root of roots)
      for (const dir of await entries(root.folder)) {
        if (dir.name.startsWith('.')) continue;
        const base = path.join(root.folder, dir.name);
        const isDirectory =
          dir.isDirectory() ||
          (dir.isSymbolicLink() &&
            (await fs
              .stat(base)
              .then((s) => s.isDirectory())
              .catch(() => false)));
        if (!isDirectory) continue;
        const workshopId = root.workshop && /^\d+$/.test(dir.name) ? dir.name : undefined;
        if (root.workshop && !workshopId) continue;
        const modsRoot = root.development
          ? path.join(base, 'Contents', 'mods')
          : workshopId
            ? path.join(base, 'mods')
            : root.folder;
        const modDirs =
          workshopId || root.development
            ? (await entries(modsRoot))
                .filter((d) => d.isDirectory())
                .map((d) => path.join(modsRoot, d.name))
            : [base];
        for (const modDir of modDirs) {
          const variants = (await entries(modDir))
            .filter((d) => d.isDirectory() && /^\d+(\.\d+)*$/.test(d.name))
            .map((d) => d.name);
          const eligible = variants
            .filter((v) => !version || compareVersion(v, version) <= 0)
            .sort((a, b) => compareVersion(b, a));
          const selected = eligible[0];
          const commonPath = path.join(modDir, 'common', 'mod.info');
          const legacyPath = path.join(modDir, 'mod.info');
          const candidatePaths = [
            ...(selected ? [path.join(modDir, selected, 'mod.info')] : []),
            commonPath,
            legacyPath,
            ...variants.sort(compareVersion).map((v) => path.join(modDir, v, 'mod.info')),
          ];
          let infoPath = legacyPath;
          let info: Record<string, string> = {};
          for (const candidate of candidatePaths) {
            const metadata = parseInfo(await read(candidate));
            if (metadata.id) {
              infoPath = candidate;
              info = metadata;
              break;
            }
          }
          if (!info.id) continue;
          const id = normalize(info.id);
          const imageKey = hash(infoPath).slice(0, 24);
          let image: string | undefined;
          for (const imageName of [info.poster, info.icon].filter(Boolean)) {
            for (const folder of [path.dirname(infoPath), path.join(modDir, 'common'), modDir]) {
              const candidate = path.resolve(folder, imageName);
              if (!candidate.startsWith(path.resolve(modDir) + path.sep)) continue;
              if (
                await fs
                  .stat(candidate)
                  .then((s) => s.isFile())
                  .catch(() => false)
              ) {
                image = imageKey;
                this.images.set(imageKey, candidate);
                break;
              }
            }
            if (image) break;
          }
          if (!image && root.development) {
            const preview = path.join(base, 'preview.png');
            if (
              await fs
                .stat(preview)
                .then((s) => s.isFile())
                .catch(() => false)
            ) {
              image = imageKey;
              this.images.set(imageKey, preview);
            }
          }
          mods.push({
            id,
            name: info.name || id,
            description: info.description || 'Aucune description locale disponible.',
            requires: list(info.require),
            loadAfter: (info.loadmodafter || '')
              .split(/[;,\n]/)
              .map((value) => value.trim())
              .filter(Boolean),
            loadBefore: (info.loadmodbefore || '')
              .split(/[;,\n]/)
              .map((value) => value.trim())
              .filter(Boolean),
            incompatible: list(info.incompatible || info.incompatibility || info.incompatiblemods),
            workshopId,
            image,
            source: infoPath,
            metadataModifiedAt: await fs
              .stat(infoPath)
              .then((stat) => stat.mtime.toISOString())
              .catch(() => undefined),
            versionMin:
              info.versionmin || (variants.length ? variants.sort(compareVersion)[0] : undefined),
            versionMax:
              info.versionmax ||
              (infoPath === legacyPath && !variants.length ? '41.999' : undefined),
            variants,
          });
        }
      }
    this.scanned = mods;
    this.scannedAt = Date.now();
    this.scannedVersion = version;
    return mods;
  }
  async image(key: string) {
    return this.images.get(key);
  }
  async remove(id: string, ids: string[], revision: string) {
    return this.writeSave(id, revision, (original) => {
      const active = parseSave(original);
      if (ids.some((i) => !active.some((a) => normalize(a) === normalize(i))))
        throw Error("Un mod demandé n'est pas actif.");
      const removed = new Set(ids.map(normalize));
      const next = original.replace(
        /^[\t ]*mod[^\S\r\n]*=[^\S\r\n]*(.*?)\s*,?[\t ]*(?:\r?\n|$)/gm,
        (line, value: string) =>
          removed.has(normalize(value.replace(/,$/, '').trim())) ? '' : line,
      );
      if (
        parseSave(next).length !==
        active.length - active.filter((i) => removed.has(normalize(i))).length
      )
        throw Error('Format mods.txt non pris en charge.');
      return next;
    });
  }
  async reorder(id: string, ids: string[], revision: string) {
    return this.writeSave(id, revision, (original) => {
      if (!isExactPermutation(parseSave(original), ids))
        throw Error('Identifiants de réorganisation invalides.');
      let index = 0;
      const next = original.replace(
        /^([\t ]*mod[\t ]*=[\t ]*)([^,\r\n]+?)([\t ]*,?[\t ]*\r?)$/gm,
        (line, prefix: string, value: string, suffix: string) =>
          value.trim() ? `${prefix}${ids[index++]}${suffix}` : line,
      );
      if (
        index !== ids.length ||
        !parseSave(next).every((value, position) => value === ids[position])
      )
        throw Error('Format mods.txt non pris en charge.');
      return next;
    });
  }
  private async writeSave(id: string, revision: string, transform: (original: string) => string) {
    if (this.busy) throw Error('Une modification est déjà en cours.');
    this.busy = true;
    try {
      if (await (this.options.isGameRunning || isGameRunning)())
        throw Error('Ferme Project Zomboid avant de modifier une sauvegarde.');
      const file = path.join(this.savePath(id), 'mods.txt');
      const original = await fs.readFile(file, 'utf8');
      if (hash(original) !== revision) throw Error('La sauvegarde a changé. Actualise.');
      const next = transform(original);
      const backup =
        file +
        '.pz-mods-' +
        new Date().toISOString().replace(/[:.]/g, '-') +
        '-' +
        randomUUID() +
        '.bak';
      await fs.copyFile(file, backup, fs.constants.COPYFILE_EXCL);
      const temporary = file + '.' + randomUUID() + '.tmp';
      try {
        await fs.writeFile(temporary, next, { flag: 'wx' });
        if (hash(await fs.readFile(file, 'utf8')) !== revision)
          throw Error('Modification concurrente détectée.');
        await fs.rename(temporary, file);
      } finally {
        await fs.unlink(temporary).catch(() => {});
      }
      return backup;
    } finally {
      this.busy = false;
    }
  }
}
