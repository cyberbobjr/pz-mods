import { normalize, type Mod } from './mods.js';

export type TransferMod = {
  id: string;
  rawId: string;
  name: string;
  workshopId?: string;
  status: 'workshop' | 'local' | 'missing' | 'ambiguous';
};
export type TransferWarning = {
  kind: 'local' | 'missing' | 'ambiguous' | 'workshop-not-listed';
  modId: string;
};
export type TransferManifest = {
  version: 1;
  appid: 108600;
  mods: TransferMod[];
  workshopIds: string[];
  warnings: TransferWarning[];
};
export type TransferResult = { manifest: TransferManifest; serverText: string };
export type ParsedServerMods = { ids: string[]; workshopIds: string[] };

const MAX_IDS = 10000;
const MAX_BYTES = 1024 * 1024;
const unique = (values: string[]) => [...new Set(values)];

function validWorkshopId(value: string) {
  return /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= 18446744073709551615n;
}

function checkIds(ids: string[]) {
  if (
    ids.length > MAX_IDS ||
    ids.some(
      (id) =>
        !normalize(id) ||
        id.length > 512 ||
        /[;=]/.test(id) ||
        [...id].some(
          (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        ),
    )
  ) {
    throw Error('Liste de mods invalide ou trop volumineuse.');
  }
}

/** Returns only the two whitelisted fields; other configuration is never retained. */
export function parseDedicatedServer(text: string): ParsedServerMods {
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES)
    throw Error('Configuration trop volumineuse.');
  const fields = new Map<string, string[]>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(Mods|WorkshopItems)\s*=(.*)$/i);
    if (!match) continue;
    const key = match[1].toLowerCase();
    if (fields.has(key)) throw Error('Directive Mods ou WorkshopItems répétée.');
    const value = match[2].trim();
    const items = value
      ? value
          .split(';')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    fields.set(key, items);
  }
  if (!fields.size) throw Error('Aucune directive Mods ou WorkshopItems trouvée.');
  const ids = fields.get('mods') || [];
  const parents = fields.get('workshopitems') || [];
  checkIds(ids);
  if (ids.length + parents.length > MAX_IDS) throw Error('Liste de mods trop volumineuse.');
  if (parents.some((id) => !validWorkshopId(id))) throw Error('Identifiant Workshop invalide.');
  return { ids, workshopIds: unique(parents) };
}

function resolveMod(rawId: string, installed: Mod[]): TransferMod {
  const id = normalize(rawId);
  const qualified = rawId
    .trim()
    .replace(/^\\+/, '')
    .match(/^(\d+)\//)?.[1];
  if (qualified && !validWorkshopId(qualified)) throw Error('Identifiant Workshop invalide.');
  const candidates = installed.filter(
    (mod) => normalize(mod.id) === id && (!qualified || mod.workshopId === qualified),
  );
  if (!candidates.length) return { id, rawId, name: id, workshopId: qualified, status: 'missing' };
  const providers = new Set(candidates.map((mod) => mod.workshopId || 'local'));
  if (providers.size > 1) return { id, rawId, name: id, status: 'ambiguous' };
  const selected = candidates[0];
  const workshopId = selected.workshopId;
  if (workshopId && !validWorkshopId(workshopId))
    return { id, rawId, name: selected.name || id, status: 'ambiguous' };
  return {
    id,
    rawId,
    name: selected.name || id,
    workshopId,
    status: workshopId ? 'workshop' : 'local',
  };
}

/** Explicit imported parents are authoritative and never paired to Mods by position. */
export function buildTransfer(
  ids: string[],
  installed: Mod[],
  explicitWorkshopIds?: string[],
): TransferResult {
  checkIds(ids);
  const mods = ids.map((rawId) => resolveMod(rawId, installed));
  const workshopIds =
    explicitWorkshopIds === undefined
      ? unique(mods.flatMap((mod) => (mod.workshopId ? [mod.workshopId] : [])))
      : unique(explicitWorkshopIds);
  if (workshopIds.some((id) => !validWorkshopId(id))) throw Error('Identifiant Workshop invalide.');
  const warnings: TransferWarning[] = mods.flatMap((mod) =>
    mod.status === 'workshop' ? [] : [{ kind: mod.status, modId: mod.id }],
  );
  if (explicitWorkshopIds !== undefined) {
    for (const mod of mods) {
      if (mod.workshopId && !workshopIds.includes(mod.workshopId))
        warnings.push({ kind: 'workshop-not-listed', modId: mod.id });
    }
  }
  const manifest: TransferManifest = { version: 1, appid: 108600, mods, workshopIds, warnings };
  return {
    manifest,
    serverText: `Mods=${mods.map((mod) => mod.id).join(';')}\nWorkshopItems=${workshopIds.join(';')}\n`,
  };
}
