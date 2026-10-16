export type NavigationTab = 'active' | 'all' | 'unused' | 'missing' | 'issues';
export type NavigationContext = { search: string; page: number };
export type NavigationState = {
  version: 1;
  tab: NavigationTab;
  search: string;
  page: number;
  saveId?: string;
  contexts?: Record<string, NavigationContext>;
};

export const NAVIGATION_STORAGE_KEY = 'pz-mods.navigation.v1';
export const DEFAULT_NAVIGATION_STATE: Readonly<NavigationState> = Object.freeze({
  version: 1,
  tab: 'active',
  search: '',
  page: 1,
});
const TABS: readonly NavigationTab[] = ['active', 'all', 'unused', 'missing', 'issues'];
const MAX_SEARCH_LENGTH = 500;
const MAX_PAGE = 100000;
const MAX_SAVE_ID_LENGTH = 256;
const MAX_CONTEXTS = 200;
const MAX_CONTEXT_KEY_LENGTH = 300;

export function navigationContextKey(saveId: string | undefined, tab: NavigationTab) {
  return JSON.stringify([saveId || '', tab]);
}

function parseContext(value: Record<string, unknown>): NavigationContext {
  return {
    search: typeof value.search === 'string' ? value.search.slice(0, MAX_SEARCH_LENGTH) : '',
    page:
      typeof value.page === 'number' &&
      Number.isInteger(value.page) &&
      value.page > 0 &&
      value.page <= MAX_PAGE
        ? value.page
        : 1,
  };
}

function parseContexts(value: unknown): Record<string, NavigationContext> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries: [string, NavigationContext][] = [];
  for (const [key, context] of Object.entries(value)) {
    if (entries.length === MAX_CONTEXTS) break;
    if (
      !key ||
      key.length > MAX_CONTEXT_KEY_LENGTH ||
      !context ||
      typeof context !== 'object' ||
      Array.isArray(context)
    )
      continue;
    entries.push([key, parseContext(context as Record<string, unknown>)]);
  }
  return Object.fromEntries(entries);
}

export function parseNavigationState(value: string | null): NavigationState {
  const fallback = (): NavigationState => ({ ...DEFAULT_NAVIGATION_STATE });
  if (!value) return fallback();
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback();
    const state = parsed as Record<string, unknown>;
    if (state.version !== 1) return fallback();
    const result: NavigationState = {
      version: 1,
      tab:
        typeof state.tab === 'string' && TABS.includes(state.tab as NavigationTab)
          ? (state.tab as NavigationTab)
          : 'active',
      ...parseContext(state),
    };
    if (
      typeof state.saveId === 'string' &&
      state.saveId.length > 0 &&
      state.saveId.length <= MAX_SAVE_ID_LENGTH &&
      ![...state.saveId].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    ) {
      result.saveId = state.saveId;
    }
    const contexts = parseContexts(state.contexts);
    if (contexts) result.contexts = contexts;
    return result;
  } catch {
    return fallback();
  }
}

export function readNavigationState(storage?: Pick<Storage, 'getItem'>): NavigationState {
  try {
    const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    return parseNavigationState(target?.getItem(NAVIGATION_STORAGE_KEY) ?? null);
  } catch {
    return { ...DEFAULT_NAVIGATION_STATE };
  }
}

export function writeNavigationState(
  state: NavigationState,
  storage?: Pick<Storage, 'setItem'>,
): boolean {
  try {
    const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    if (!target) return false;
    const validated = parseNavigationState(JSON.stringify(state));
    target.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify(validated));
    return true;
  } catch {
    return false;
  }
}
