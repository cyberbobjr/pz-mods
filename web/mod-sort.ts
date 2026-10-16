import type { WorkshopDetail } from '../src/domain/mods';
import { orderParentGroups } from './load-order';
import type { ParentGroup } from './parent-groups';

export const SORT_STORAGE_KEY = 'pz-mods-sort';
export const SORT_MODES = ['save', 'updated-desc', 'updated-asc', 'name-asc', 'name-desc'] as const;
export type SortMode = (typeof SORT_MODES)[number];
type Details = Record<string, Pick<WorkshopDetail, 'title' | 'time_updated'>>;

export function readSortMode(value: string | null): SortMode {
  return SORT_MODES.includes(value as SortMode) ? (value as SortMode) : 'save';
}

export function parentTitle(group: ParentGroup, details: Record<string, { title: string }>) {
  const first = group.members[0];
  return (
    (first.workshopId ? details[first.workshopId]?.title : undefined) ||
    (group.key.startsWith('local-project:')
      ? group.key.split('/').at(-1) || first.name
      : first.name)
  );
}

function updatedAt(group: ParentGroup, details: Details): number | undefined {
  const workshopId = group.members[0].workshopId;
  if (workshopId) {
    const timestamp = details[workshopId]?.time_updated;
    return timestamp && Number.isFinite(timestamp) && timestamp > 0 ? timestamp * 1000 : undefined;
  }
  const dates = group.members
    .map((mod) => Date.parse(mod.metadataModifiedAt || ''))
    .filter(Number.isFinite);
  return dates.length ? Math.max(...dates) : undefined;
}

/** Sort whole parents before pagination; keep exact save positions on their submods. */
export function sortParentGroups(
  groups: ParentGroup[],
  mode: SortMode,
  details: Details,
  activeIds: string[],
  language: string,
): ParentGroup[] {
  const ordered = orderParentGroups(groups, activeIds);
  if (mode === 'save') return ordered;
  const collator = new Intl.Collator(language, { sensitivity: 'base', numeric: true });
  const alphabetical = (a: ParentGroup, b: ParentGroup) =>
    collator.compare(parentTitle(a, details), parentTitle(b, details)) ||
    a.key.localeCompare(b.key);
  return ordered.sort((a, b) => {
    if (mode === 'name-asc') return alphabetical(a, b);
    if (mode === 'name-desc') return -alphabetical(a, b);
    const aDate = updatedAt(a, details);
    const bDate = updatedAt(b, details);
    if (aDate === undefined) return bDate === undefined ? alphabetical(a, b) : 1;
    if (bDate === undefined) return -1;
    return (mode === 'updated-asc' ? aDate - bDate : bDate - aDate) || alphabetical(a, b);
  });
}
