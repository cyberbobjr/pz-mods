import {
  navigationContextKey,
  type NavigationContext,
  type NavigationTab,
} from './navigation-state';

/** Rename moves navigation history; duplication copies it while preserving the original. */
export function collectionContexts(
  contexts: Record<string, NavigationContext>,
  from: string,
  to: string,
  action: 'rename' | 'duplicate',
  current?: NavigationContext & { tab: NavigationTab },
) {
  const original = { ...contexts };
  if (current)
    original[navigationContextKey(from, current.tab)] = {
      search: current.search,
      page: current.page,
    };
  const next = { ...original };
  for (const tab of ['active', 'all', 'unused', 'missing', 'issues'] as const) {
    const oldKey = navigationContextKey(from, tab);
    if (original[oldKey]) next[navigationContextKey(to, tab)] = { ...original[oldKey] };
    if (action === 'rename' && from !== to) delete next[oldKey];
  }
  return next;
}
