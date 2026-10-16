export type PathOverrides = {
  userDir?: string;
  steamPath?: string;
  savesDir?: string;
  localModsDirs?: string[];
  workshopDirs?: string[];
};
export type LibraryPaths = Required<PathOverrides>;
export type SettingsResult = { paths: LibraryPaths; overrides: PathOverrides };

export function parsePathOverrides(value: unknown): PathOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Configuration des chemins invalide.');
  const input = value as Record<string, unknown>;
  const result: PathOverrides = {};
  for (const key of Object.keys(input)) {
    if (!['userDir', 'steamPath', 'savesDir', 'localModsDirs', 'workshopDirs'].includes(key))
      throw Error('Configuration des chemins invalide.');
  }
  for (const key of ['userDir', 'steamPath', 'savesDir'] as const) {
    const item = input[key];
    if (item === undefined || item === '') continue;
    if (typeof item !== 'string' || item.length > 4096)
      throw Error('Configuration des chemins invalide.');
    if (item.trim()) result[key] = item.trim();
  }
  for (const key of ['localModsDirs', 'workshopDirs'] as const) {
    const items = input[key];
    if (items === undefined) continue;
    if (
      !Array.isArray(items) ||
      items.length > 32 ||
      items.some((item) => typeof item !== 'string' || !item.trim() || item.length > 4096)
    )
      throw Error('Configuration des chemins invalide.');
    result[key] = [...new Set(items.map((item) => (item as string).trim()))];
  }
  return result;
}
