import type { Mod } from '../src/domain/mods';

export type ParentGroup = { key: string; members: Mod[] };

export function groupMods(mods: Mod[]): ParentGroup[] {
  const groups = new Map<string, Mod[]>();
  for (const mod of mods) {
    const source = mod.source.replaceAll('\\', '/');
    const project = source.match(/^(.*\/Workshop\/[^/]+)\/Contents\/mods\//i)?.[1];
    const key = mod.workshopId
      ? `workshop:${mod.workshopId}`
      : project
        ? `local-project:${project}`
        : `local:${mod.source || mod.id}`;
    const members = groups.get(key) || [];
    members.push(mod);
    groups.set(key, members);
  }
  return [...groups].map(([key, members]) => ({ key, members }));
}
