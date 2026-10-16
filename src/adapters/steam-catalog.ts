import type { SteamCatalogPort } from '../application/steam-actions.js';

export class SteamCatalog implements SteamCatalogPort {
  constructor(private readonly request: typeof fetch = fetch) {}
  async inspect(ids: string[]) {
    const body = new URLSearchParams({ itemcount: String(ids.length) });
    ids.forEach((id, index) => body.set(`publishedfileids[${index}]`, id));
    const response = await this.request(
      'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/',
      { method: 'POST', body, signal: AbortSignal.timeout(20000) },
    );
    if (!response.ok)
      throw Error('Impossible de vérifier les identifiants sur Steam. Réessayez plus tard.');
    const data = (await response.json()) as {
      response?: {
        publishedfiledetails?: {
          publishedfileid: string;
          result: number;
          consumer_app_id: number;
          file_type?: number;
        }[];
      };
    };
    return Object.fromEntries(
      (data.response?.publishedfiledetails || [])
        .filter(
          (item) =>
            ids.includes(item.publishedfileid) &&
            item.result === 1 &&
            Number.isInteger(item.consumer_app_id),
        )
        .map((item) => [
          item.publishedfileid,
          { appId: item.consumer_app_id, collection: item.file_type === 2 },
        ]),
    );
  }
}
