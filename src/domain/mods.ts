export type Mod = {
  id: string;
  name: string;
  description: string;
  workshopId?: string;
  requires: string[];
  incompatible: string[];
  image?: string;
  source: string;
  versionMin?: string;
  versionMax?: string;
  variants: string[];
  metadataModifiedAt?: string;
  loadAfter?: string[];
  loadBefore?: string[];
};
export type WorkshopDetail = {
  title: string;
  description: string;
  preview_url: string;
  time_updated: number;
  fetchedAt: number;
  cacheStale?: boolean;
};
export type Save = {
  id: string;
  name: string;
  mode: string;
  modified: string;
  version?: string;
};
export type Issue = {
  kind: 'missing' | 'dependency' | 'incompatible' | 'version' | 'duplicate';
  severity: 'error' | 'warning';
  modId: string;
  target?: string;
  message: string;
};
export const normalize = (id: string) =>
  id
    .trim()
    .replace(/^\\+/, '')
    .replace(/^\d+\//, '');
export function compareVersion(a: string, b: string) {
  const x = a.split('.').map(Number),
    y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}
export function analyse(mods: Mod[], activeIds: string[], version?: string) {
  const active = new Set(activeIds.map(normalize));
  const byId = new Map<string, Mod[]>();
  for (const mod of mods) {
    const key = normalize(mod.id);
    byId.set(key, [...(byId.get(key) || []), mod]);
  }
  const issues: Issue[] = [];
  const incompatiblePairs = new Set<string>();
  for (const id of active) {
    const qualified = activeIds
      .find((raw) => normalize(raw) === id)
      ?.trim()
      .replace(/^\\+/, '');
    const workshopId = qualified?.match(/^(\d+)\//)?.[1];
    const candidates = (byId.get(id) || []).filter(
      (mod) => !workshopId || mod.workshopId === workshopId,
    );
    if (!candidates.length) {
      issues.push({
        kind: 'missing',
        severity: 'error',
        modId: id,
        message: 'Mod actif dans la sauvegarde mais introuvable sur le disque.',
      });
      continue;
    }
    if (candidates.length > 1)
      issues.push({
        kind: 'duplicate',
        severity: 'warning',
        modId: id,
        message:
          'Plusieurs installations fournissent cet identifiant ; priorité de chargement à vérifier.',
      });
    const mod = candidates[0];
    for (const dep of mod.requires) {
      const target = normalize(dep);
      if (!active.has(target))
        issues.push({
          kind: 'dependency',
          severity: 'error',
          modId: id,
          target,
          message: byId.has(target)
            ? 'Prérequis installé mais inactif dans cette sauvegarde.'
            : 'Prérequis absent du disque et de la sauvegarde.',
        });
    }
    for (const other of mod.incompatible) {
      const target = normalize(other);
      const pair = JSON.stringify([id, target].sort());
      if (active.has(target) && !incompatiblePairs.has(pair)) {
        incompatiblePairs.add(pair);
        issues.push({
          kind: 'incompatible',
          severity: 'error',
          modId: id,
          target,
          message: 'Incompatibilité déclarée dans mod.info entre deux mods actifs.',
        });
      }
    }
    if (
      version &&
      ((mod.versionMin && compareVersion(version, mod.versionMin) < 0) ||
        (mod.versionMax && compareVersion(version, mod.versionMax) > 0))
    )
      issues.push({
        kind: 'version',
        severity: 'error',
        modId: id,
        message: `Version ${version} hors de la plage détectée ${mod.versionMin || '...'} - ${mod.versionMax || '...'}.`,
      });
  }
  return issues;
}
export function removalBlockers(mods: Mod[], activeIds: string[], removeIds: string[]) {
  const removed = new Set(removeIds.map(normalize));
  const active = new Set(activeIds.map(normalize));
  return mods
    .filter(
      (m) =>
        active.has(normalize(m.id)) &&
        !removed.has(normalize(m.id)) &&
        m.requires.some((d) => removed.has(normalize(d))),
    )
    .map((m) => m.id);
}

export type LoadOrderViolation = {
  modId: string;
  target: string;
  kind: 'require' | 'after' | 'before';
  message: string;
};

export function isExactPermutation(original: string[], proposed: string[]) {
  if (original.length !== proposed.length) return false;
  const counts = new Map<string, number>();
  for (const id of original) counts.set(id, (counts.get(id) || 0) + 1);
  for (const id of proposed) {
    const count = counts.get(id) || 0;
    if (!count) return false;
    counts.set(id, count - 1);
  }
  return true;
}

/** Only constraints whose two endpoints are active can constrain their order. */
export function validateLoadOrder(mods: Mod[], ids: string[]): LoadOrderViolation[] {
  const violations: LoadOrderViolation[] = [];
  const seen = new Set<string>();
  const position = (reference: string) =>
    ids.findIndex((raw) => {
      const qualified = reference.trim().replace(/^\\+/, '');
      return /^\d+\//.test(qualified)
        ? raw.trim().replace(/^\\+/, '') === qualified
        : normalize(raw) === normalize(reference);
    });
  for (const [index, raw] of ids.entries()) {
    const modId = normalize(raw);
    const workshopId = raw
      .trim()
      .replace(/^\\+/, '')
      .match(/^(\d+)\//)?.[1];
    const mod = mods.find(
      (candidate) =>
        normalize(candidate.id) === modId && (!workshopId || candidate.workshopId === workshopId),
    );
    if (!mod) continue;
    const constraints: [LoadOrderViolation['kind'], string[], boolean][] = [
      ['require', mod.requires, true],
      ['after', mod.loadAfter || [], true],
      ['before', mod.loadBefore || [], false],
    ];
    for (const [kind, targets, mustFollow] of constraints) {
      for (const reference of targets) {
        const targetIndex = position(reference);
        if (targetIndex < 0 || (mustFollow ? targetIndex < index : index < targetIndex)) continue;
        const target = normalize(reference);
        const key = JSON.stringify([modId, target, kind]);
        if (seen.has(key)) continue;
        seen.add(key);
        violations.push({
          modId,
          target,
          kind,
          message: `${modId} doit être chargé ${mustFollow ? 'après' : 'avant'} ${target}.`,
        });
      }
    }
  }
  return violations;
}
