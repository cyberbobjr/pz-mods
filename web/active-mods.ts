import { normalize, matchesInstalledMod, type Mod } from '../src/domain/mods';
export type SourceMod = Mod & { activeRef?: string };

export function selectionId(mod: Mod) {
  return (mod as SourceMod).activeRef || normalize(mod.id);
}

function reference(raw: string) {
  const qualified = raw.trim().replace(/^\\+/, '');
  return { id: normalize(raw), provider: qualified.match(/^(\d+)\//)?.[1] };
}

/** Source membership does not depend on whether the mod's files are installed. */
export function matchesActive(mod: Mod, ids: string[]) {
  return ids.some((raw) => matchesInstalledMod(raw, mod));
}

/** Preserve qualified references before normalizing, so missing providers remain visible. */
export function sourceInventory(installed: Mod[], ids: string[], description: string): SourceMod[] {
  const missing = new Map<string, SourceMod>();
  for (const raw of ids) {
    const { id, provider } = reference(raw);
    if (!id || installed.some((mod) => matchesInstalledMod(raw, mod))) continue;
    const key = JSON.stringify([provider || '', id]);
    if (!missing.has(key))
      missing.set(key, {
        id,
        name: id,
        workshopId: provider,
        activeRef: raw.trim().replace(/^\\+/, ''),
        description,
        requires: [],
        incompatible: [],
        source: '',
        variants: [],
      });
  }
  const installedEntries = installed.map((mod) => {
    const references = ids.filter((raw) => matchesActive(mod, [raw]));
    const activeRef = references.find((raw) => !reference(raw).provider) || references[0];
    return activeRef ? { ...mod, activeRef: activeRef.trim().replace(/^\\+/, '') } : mod;
  });
  return [...installedEntries, ...missing.values()];
}

/** Select identifiers only; actual removal still uses the normal confirmation and API. */
export function missingModIds(mods: Mod[], activeIds: string[]) {
  return [
    ...new Set(mods.filter((mod) => !mod.source && matchesActive(mod, activeIds)).map(selectionId)),
  ];
}
