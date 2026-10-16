export const THEMES = ['survivor', 'midnight', 'amethyst', 'copper'] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_STORAGE_KEY = 'pz-mods-theme';
export function readTheme(value: string | null): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : 'survivor';
}
export function initialTheme(): Theme {
  try {
    return readTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'survivor';
  }
}
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The visual preference remains usable without browser storage.
  }
}
