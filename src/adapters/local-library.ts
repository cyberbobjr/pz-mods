import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { LibraryPort } from '../application/service.js';
import type { ConfigurableLibraryPort } from '../application/settings.js';
import { parsePathOverrides, type PathOverrides, type SettingsResult } from '../domain/settings.js';
import { validateAddedId } from '../domain/additions.js';
import type { DirectoryResolverPort } from '../application/explorer.js';
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

export class LocalLibrary implements LibraryPort, ConfigurableLibraryPort, DirectoryResolverPort {
  private root: string;
  private steamPath = '';
  private savesRoot = '';
  private localRoots: string[] = [];
  private workshopRoots: string[] = [];
  private overrides: PathOverrides = {};
  private configuring = false;
  private generation = 0;
  constructor(private readonly options: LocalLibraryOptions = {}) {
    this.root = options.userDir || process.env.PZ_USER_DIR || path.join(os.homedir(), 'Zomboid');
  }
  private images = new Map<string, string>();
  private modDirectories = new Map<string, { folder: string; realPath: string }>();
  private savePaths = new Map<string, string>();
  private busy = false;
  private gameVersion = '';
  private scanned: Mod[] = [];
  private scannedVersion = '';
  private scannedAt = 0;
  async init() {
    await this.configure({});
  }
  async settings(): Promise<SettingsResult> {
    return {
      paths: {
        userDir: this.root,
        steamPath: this.steamPath,
        savesDir: this.savesRoot,
        localModsDirs: [...this.localRoots],
        workshopDirs: [...this.workshopRoots],
      },
      overrides: structuredClone(this.overrides),
    };
  }
  async configure(value: PathOverrides, commit?: () => Promise<void>) {
    if (this.busy || this.configuring) throw Error('Une modification est déjà en cours.');
    this.configuring = true;
    try {
      const overrides = parsePathOverrides(value);
      const supplied = [
        overrides.userDir,
        overrides.steamPath,
        overrides.savesDir,
        ...(overrides.localModsDirs || []),
        ...(overrides.workshopDirs || []),
      ].filter((item): item is string => item !== undefined);
      for (const folder of supplied) {
        if (
          !path.isAbsolute(folder) ||
          !(await fs
            .stat(folder)
            .then((stat) => stat.isDirectory())
            .catch(() => false))
        )
          throw Error('Un chemin doit désigner un dossier absolu existant.');
      }
      const userDir =
        overrides.userDir ||
        this.options.userDir ||
        process.env.PZ_USER_DIR ||
        path.join(os.homedir(), 'Zomboid');
      const steam =
        overrides.steamPath ||
        this.options.steamPath ||
        process.env.STEAM_PATH ||
        'C:/Program Files (x86)/Steam';
      const vdf = await read(path.join(steam, 'steamapps/libraryfolders.vdf'));
      const libraries = [
        ...new Set([
          steam,
          ...[...vdf.matchAll(/"path"\s+"([^"]+)"/g)].map((m) => m[1].replace(/\\\\/g, '\\')),
        ]),
      ];
      const gameVersion =
        (await read(path.join(userDir, 'version.txt'))).match(/\d+\.\d+(?:\.\d+)?/)?.[0] || '';
      // All validation and initialization reads have succeeded. Keep mutations
      // locked while persisting, then switch the prepared configuration at once.
      await commit?.();
      this.root = userDir;
      this.steamPath = steam;
      this.savesRoot = overrides.savesDir || path.join(userDir, 'Saves');
      this.localRoots = overrides.localModsDirs || [path.join(userDir, 'mods')];
      this.workshopRoots =
        overrides.workshopDirs ||
        libraries.map((library) => path.join(library, 'steamapps/workshop/content/108600'));
      this.gameVersion = gameVersion;
      this.overrides = overrides;
      this.generation++;
      this.images.clear();
      this.modDirectories.clear();
      this.savePaths.clear();
      this.scanned = [];
      this.scannedAt = 0;
      this.scannedVersion = '';
    } finally {
      this.configuring = false;
    }
  }
  private ensureConfigured() {
    if (this.configuring)
      throw Error('Une modification des chemins est en cours. Actualise après son application.');
  }
  async status() {
    return {
      userDir: this.root,
      workshopRoots: [...this.workshopRoots],
      gameVersion: this.gameVersion,
      unsubscribe: 'workshop-page',
      analysis:
        'Métadonnées mod.info, prérequis, incompatibilités déclarées, versions et doublons. Les conflits Lua, cartes et contenus non déclarés ne sont pas détectés.',
    };
  }
  async saves() {
    this.ensureConfigured();
    const generation = this.generation;
    const result: Save[] = [];
    const savePaths = new Map<string, string>();
    for (const mode of await entries(this.savesRoot)) {
      if (!mode.isDirectory() || mode.name.toLowerCase() === 'multiplayer') continue;
      for (const dir of await entries(path.join(this.savesRoot, mode.name))) {
        if (!dir.isDirectory()) continue;
        const full = path.join(this.savesRoot, mode.name, dir.name);
        const stat = await fs.stat(path.join(full, 'mods.txt')).catch(() => null);
        if (!stat) continue;
        const id = hash(full).slice(0, 24);
        savePaths.set(id, full);
        result.push({
          id,
          name: dir.name,
          mode: mode.name,
          modified: stat.mtime.toISOString(),
        });
      }
    }
    if (generation !== this.generation || this.configuring)
      throw Error('Les chemins ont changé. Actualise la liste.');
    this.savePaths = savePaths;
    return result.sort((a, b) => b.modified.localeCompare(a.modified));
  }
  private savePath(id: string) {
    const p = this.savePaths.get(id);
    if (!p) throw Error('Sauvegarde inconnue. Actualise la liste.');
    return p;
  }
  async readSave(id: string) {
    this.ensureConfigured();
    const generation = this.generation;
    const p = this.savePath(id);
    const text = await fs.readFile(path.join(p, 'mods.txt'), 'utf8');
    if (generation !== this.generation || this.configuring)
      throw Error('Les chemins ont changé. Actualise la liste.');
    return {
      ids: parseSave(text),
      revision: hash(text),
      version: this.gameVersion || undefined,
    };
  }
  async scan(version = this.gameVersion, force = false) {
    this.ensureConfigured();
    const generation = this.generation;
    if (!force && this.scannedVersion === version && Date.now() - this.scannedAt < 30000)
      return this.scanned;
    const mods: Mod[] = [];
    const images = new Map<string, string>();
    const modDirectories = new Map<string, { folder: string; realPath: string }>();
    const roots = [
      ...this.localRoots.map((folder) => ({ folder, workshop: false, development: false })),
      { folder: path.join(this.root, 'Workshop'), workshop: false, development: true },
      ...this.workshopRoots.map((folder) => ({
        folder,
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
          const directory = await fs.realpath(modDir).catch(() => undefined);
          const folderKey = directory ? hash(`directory:${directory}`).slice(0, 24) : undefined;
          if (folderKey && directory)
            modDirectories.set(folderKey, { folder: modDir, realPath: directory });
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
                images.set(imageKey, candidate);
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
              images.set(imageKey, preview);
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
            folderKey,
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
    if (generation !== this.generation || this.configuring)
      throw Error('Les chemins ont changé. Actualise la liste.');
    this.images = images;
    this.modDirectories = modDirectories;
    this.scanned = mods;
    this.scannedAt = Date.now();
    this.scannedVersion = version;
    return mods;
  }
  async image(key: string) {
    this.ensureConfigured();
    return this.images.get(key);
  }
  async resolveModDirectory(key: string) {
    this.ensureConfigured();
    const generation = this.generation;
    if (!/^[a-f0-9]{24}$/.test(key)) return undefined;
    const directory = this.modDirectories.get(key);
    if (!directory) return undefined;
    try {
      if (!(await fs.stat(directory.folder)).isDirectory()) return undefined;
      const actual = await fs.realpath(directory.folder);
      return !this.configuring &&
        generation === this.generation &&
        this.modDirectories.get(key) === directory &&
        actual === directory.realPath
        ? directory.realPath
        : undefined;
    } catch {
      return undefined;
    }
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
  async add(id: string, rawId: string, revision: string) {
    const added = validateAddedId(rawId);
    return this.writeSave(id, revision, (original) => {
      const active = parseSave(original);
      if (active.length >= 10000 || active.includes(added))
        throw Error('Ajout de mod invalide ou déjà présent.');
      const blocks = [
        ...original.matchAll(
          /^([\t ]*mods[\t ]*(?:\r?\n[\t ]*)?\{[\t ]*\r?\n)([\s\S]*?)(^[\t ]*\}[\t ]*,?[\t ]*(?:\r?\n|$))/gm,
        ),
      ];
      if (blocks.length !== 1) throw Error('Format mods.txt non pris en charge pour un ajout.');
      const block = blocks[0];
      const body = block[2];
      if (
        parseSave(body).length !== active.length ||
        body.split(/\r?\n/).some((line) => !/^\s*(?:#|\/\/)/.test(line) && /[{}]/.test(line))
      )
        throw Error('Format mods.txt non pris en charge pour un ajout.');
      const lineEnding = block[1].includes('\r\n') ? '\r\n' : '\n';
      const prefix = body.match(/^([\t ]*mod[\t ]*=[\t ]*)[^\r\n]+/m)?.[1] || '\tmod = ';
      const replacement = `${block[1]}${body}${prefix}${added},${lineEnding}${block[3]}`;
      const next =
        original.slice(0, block.index) +
        replacement +
        original.slice((block.index || 0) + block[0].length);
      if (JSON.stringify(parseSave(next)) !== JSON.stringify([...active, added]))
        throw Error('Format mods.txt non pris en charge pour un ajout.');
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
    this.ensureConfigured();
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
