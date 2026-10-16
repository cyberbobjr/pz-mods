import type { Mod } from '../src/domain/mods';
import type { ParentGroup } from './parent-groups';

export function loadPosition(mod: Mod, ids: string[]) {
  const index = ids.findIndex((raw) => {
    const qualified = raw.trim().replace(/^\\+/, '');
    const provider = qualified.match(/^(\d+)\//)?.[1];
    return qualified.replace(/^\d+\//, '') === mod.id && (!provider || mod.workshopId === provider);
  });
  return index < 0 ? undefined : index + 1;
}

export function orderParentGroups(groups: ParentGroup[], ids: string[]): ParentGroup[] {
  const position = (mod: Mod) => loadPosition(mod, ids) ?? Infinity;
  return groups
    .map((group) => ({
      ...group,
      members: [...group.members].sort((a, b) => position(a) - position(b)),
    }))
    .sort((a, b) => position(a.members[0]) - position(b.members[0]));
}
