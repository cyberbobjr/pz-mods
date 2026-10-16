import { normalize, type Mod } from '../src/domain/mods';
import type { ParentGroup } from './parent-groups';

function identity(mod: Mod) {
  return `${mod.workshopId || 'local'}:${normalize(mod.id)}`;
}

/** Direct consumers only; callers decide whether inactive mods should be shown. */
export function dependentsOf(mod: Mod, all: Mod[]): Mod[] {
  const targetId = normalize(mod.id);
  const self = identity(mod);
  const consumers = new Map<string, Mod>();
  for (const candidate of all) {
    const key = identity(candidate);
    if (key === self || consumers.has(key)) continue;
    const requiresTarget = candidate.requires.some((reference) => {
      const qualified = reference.trim().replace(/^\\+/, '');
      const provider = qualified.match(/^(\d+)\//)?.[1];
      return normalize(reference) === targetId && (!provider || provider === mod.workshopId);
    });
    if (requiresTarget) consumers.set(key, candidate);
  }
  return [...consumers.values()];
}

/** Includes dependencies between members of the same parent, such as Option → Core. */
export function parentDependents(
  group: ParentGroup,
  all: Mod[],
): {
  mods: Mod[];
  requiredMember?: Mod;
} {
  const consumers = new Map<string, Mod>();
  let requiredMember: Mod | undefined;
  for (const member of group.members) {
    const dependents = dependentsOf(member, all);
    if (dependents.length && !requiredMember) requiredMember = member;
    for (const dependent of dependents) {
      if (!consumers.has(identity(dependent))) consumers.set(identity(dependent), dependent);
    }
  }
  return { mods: [...consumers.values()], requiredMember };
}
