import { parsePathOverrides, type PathOverrides, type SettingsResult } from '../domain/settings.js';

export interface SettingsStorePort {
  load(): Promise<PathOverrides>;
  save(paths: PathOverrides): Promise<void>;
}
export interface ConfigurableLibraryPort {
  configure(paths: PathOverrides, commit?: () => Promise<void>): Promise<void>;
  settings(): Promise<SettingsResult>;
}

export class SettingsService {
  private busy = false;
  constructor(
    private readonly store: SettingsStorePort,
    private readonly library: ConfigurableLibraryPort,
  ) {}
  async initialize() {
    try {
      await this.library.configure(await this.store.load());
    } catch {
      await this.library.configure({});
    }
  }
  get() {
    return this.library.settings();
  }
  async update(value: unknown) {
    if (this.busy) throw Error('Une modification des chemins est déjà en cours.');
    const paths = parsePathOverrides(value);
    this.busy = true;
    try {
      await this.library.configure(paths, async () => {
        try {
          await this.store.save(paths);
        } catch {
          throw Error('Impossible d’enregistrer la configuration des chemins.');
        }
      });
      return this.library.settings();
    } finally {
      this.busy = false;
    }
  }
}
