export type SteamSessionStatus = { available: boolean; connected: boolean; busy?: boolean };
export interface SteamAccountPort {
  status(): Promise<SteamSessionStatus>;
  connect(): Promise<SteamSessionStatus>;
  subscribe(id: string): Promise<'subscribed' | 'alreadySubscribed'>;
  beginCollection(title: string): Promise<void>;
  detectCollection(): Promise<string | undefined>;
  addToCollection(collectionId: string, id: string): Promise<void>;
}
export interface SteamCatalogPort {
  inspect(ids: string[]): Promise<Record<string, { appId: number; collection: boolean }>>;
}
const validId = (id: string) => /^[1-9]\d{0,19}$/.test(id) && BigInt(id) <= 18446744073709551615n;
export class SteamActionsService {
  private busy = false;
  constructor(
    private readonly account: SteamAccountPort,
    private readonly catalog: SteamCatalogPort,
  ) {}
  async status() {
    return { ...(await this.account.status()), busy: this.busy };
  }
  async connect() {
    if (this.busy) throw Error('Une opération Steam est déjà en cours.');
    this.busy = true;
    try {
      return await this.account.connect();
    } finally {
      this.busy = false;
    }
  }
  private ids(values: unknown): string[] {
    if (
      !Array.isArray(values) ||
      !values.length ||
      values.length > 10 ||
      values.some((id) => typeof id !== 'string' || !validId(id))
    )
      throw Error('Liste Steam invalide (10 identifiants maximum).');
    return [...new Set(values)];
  }
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.busy) throw Error('Une opération Steam est déjà en cours.');
    this.busy = true;
    try {
      if (!(await this.account.status()).connected)
        throw Error('Connectez-vous à Steam dans le navigateur dédié.');
      return await operation();
    } finally {
      this.busy = false;
    }
  }
  async subscribe(values: unknown) {
    const ids = this.ids(values);
    return this.run(async () => {
      const details = await this.catalog.inspect(ids);
      const result: {
        subscribed: string[];
        alreadySubscribed: string[];
        failed: { id: string; error: string }[];
      } = { subscribed: [], alreadySubscribed: [], failed: [] };
      for (const id of ids) {
        try {
          if (details[id]?.appId !== 108600 || details[id].collection)
            throw Error('Cet identifiant ne correspond pas à un mod Project Zomboid vérifiable.');
          result[await this.account.subscribe(id)].push(id);
        } catch (error) {
          result.failed.push({
            id,
            error: error instanceof Error ? error.message : 'Action Steam impossible.',
          });
        }
      }
      return result;
    });
  }
  async beginCollection(value: unknown) {
    if (typeof value !== 'string' || !value.trim() || value.length > 128)
      throw Error('Le titre de collection doit contenir entre 1 et 128 caractères.');
    return this.run(async () => {
      await this.account.beginCollection(value.trim());
      return { pending: true };
    });
  }
  async detectCollection() {
    return this.run(async () => ({ id: await this.account.detectCollection() }));
  }
  async add(values: unknown, collectionId: unknown) {
    const ids = this.ids(values);
    if (typeof collectionId !== 'string' || !validId(collectionId))
      throw Error('Identifiant de collection invalide.');
    return this.run(async () => {
      const details = await this.catalog.inspect(ids);
      const result: { added: string[]; failed: { id: string; error: string }[] } = {
        added: [],
        failed: [],
      };
      for (const id of ids) {
        try {
          if (id === collectionId || details[id]?.appId !== 108600 || details[id].collection)
            throw Error('Cet identifiant ne correspond pas à un mod Project Zomboid vérifiable.');
          await this.account.addToCollection(collectionId, id);
          result.added.push(id);
        } catch (error) {
          result.failed.push({
            id,
            error: error instanceof Error ? error.message : 'Action Steam impossible.',
          });
        }
      }
      return result;
    });
  }
}
