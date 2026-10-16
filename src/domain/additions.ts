import {
  analyse,
  normalize,
  validateLoadOrder,
  type Issue,
  type LoadOrderViolation,
  type Mod,
} from './mods.js';

export type AddPreview = {
  id: string;
  ids: string[];
  issues: Issue[];
  orderViolations: LoadOrderViolation[];
  alreadyActive: boolean;
  missing: boolean;
};

export function validateAddedId(value: string) {
  if (typeof value !== 'string') throw Error('Identifiant de mod invalide.');
  const id = value.trim();
  if (
    !id ||
    id.length > 512 ||
    /[;,{}=]/.test(id) ||
    [...value].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    !normalize(id)
  )
    throw Error('Identifiant de mod invalide.');
  const qualifier = id.replace(/^\\+/, '').match(/^(\d+)\//)?.[1];
  if (
    qualifier &&
    (!/^[1-9]\d{0,19}$/.test(qualifier) || BigInt(qualifier) > 18446744073709551615n)
  )
    throw Error('Identifiant de mod invalide.');
  return id;
}

const workshopQualifier = (raw: string) =>
  raw
    .trim()
    .replace(/^\\+/, '')
    .match(/^(\d+)\//)?.[1];

export function previewAddition(
  mods: Mod[],
  activeIds: string[],
  value: string,
  version?: string,
): AddPreview {
  const requested = validateAddedId(value);
  const internalId = normalize(requested);
  const explicitProvider = workshopQualifier(requested);
  const all = mods.filter((mod) => normalize(mod.id) === internalId);
  const candidates = all.filter((mod) => !explicitProvider || mod.workshopId === explicitProvider);
  const providers = new Set(candidates.map((mod) => mod.workshopId || 'local'));
  if (providers.size > 1)
    throw Error('Identifiant de mod ambigu. Précise son identifiant Workshop.');
  const provider = explicitProvider || candidates[0]?.workshopId;
  const knownProviders = new Set(all.map((mod) => mod.workshopId || 'local'));
  const existing = activeIds.find((raw) => {
    if (normalize(raw) !== internalId) return false;
    const activeProvider = workshopQualifier(raw);
    if (activeProvider)
      return activeProvider === provider || (!provider && !candidates.length && !explicitProvider);
    if (!provider) return true;
    return knownProviders.size === 1 && knownProviders.has(provider);
  });
  let id = explicitProvider ? requested : internalId;
  if (!explicitProvider && provider) {
    const qualifiedExample = activeIds.find((raw) => workshopQualifier(raw));
    if (qualifiedExample)
      id = `${qualifiedExample.startsWith('\\') ? '\\' : ''}${provider}/${internalId}`;
  }
  if (existing !== undefined) id = existing;
  const ids = existing === undefined ? [...activeIds, id] : [...activeIds];
  if (ids.length > 10000) throw Error('La sauvegarde contient trop de mods pour cet ajout.');
  return {
    id,
    ids,
    issues: analyse(mods, ids, version),
    orderViolations: validateLoadOrder(mods, ids),
    alreadyActive: existing !== undefined,
    missing: candidates.length === 0,
  };
}
