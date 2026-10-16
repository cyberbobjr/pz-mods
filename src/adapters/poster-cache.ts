import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { PosterPort, Poster } from '../application/service.js';

const MAX_BYTES = 8 * 1024 * 1024;
const TTL = 7 * 24 * 60 * 60 * 1000;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
type CachedPoster = { url: string; savedAt: number; contentType: string; base64: string };
type Options = { directory: string; request?: typeof fetch; now?: () => number };

export function allowedPosterUrl(raw: string) {
  try {
    const url = new URL(raw);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443') &&
      ['steamstatic.com', 'steamusercontent.com', 'akamaihd.net'].some(
        (domain) => url.hostname === domain || url.hostname.endsWith('.' + domain),
      )
    );
  } catch {
    return false;
  }
}

export class PosterCache implements PosterPort {
  private readonly pending = new Map<string, Promise<Poster | undefined>>();
  private readonly request: typeof fetch;
  private readonly now: () => number;
  constructor(private readonly options: Options) {
    this.request = options.request || fetch;
    this.now = options.now || Date.now;
  }
  get(url: string): Promise<Poster | undefined> {
    if (!allowedPosterUrl(url)) return Promise.resolve(undefined);
    const existing = this.pending.get(url);
    if (existing) return existing;
    const operation = this.resolve(url).finally(() => this.pending.delete(url));
    this.pending.set(url, operation);
    return operation;
  }
  private async resolve(url: string): Promise<Poster | undefined> {
    const key = createHash('sha256').update(url).digest('hex');
    const file = path.join(this.options.directory, key + '.json');
    let cached: CachedPoster | undefined;
    try {
      const stat = await fs.stat(file);
      if (stat.size <= MAX_BYTES * 1.5) {
        const value = JSON.parse(await fs.readFile(file, 'utf8')) as CachedPoster;
        if (
          value.url === url &&
          IMAGE_TYPES.has(value.contentType) &&
          typeof value.base64 === 'string' &&
          Number.isFinite(value.savedAt)
        )
          cached = value;
      }
    } catch {
      /* A missing or damaged entry is downloaded again. */
    }
    const decode = (value: CachedPoster): Poster => ({
      bytes: Buffer.from(value.base64, 'base64'),
      contentType: value.contentType,
    });
    if (cached && this.now() >= cached.savedAt && this.now() - cached.savedAt < TTL)
      return decode(cached);
    try {
      let target = url;
      let response: Response | undefined;
      for (let redirects = 0; redirects <= 3; redirects++) {
        if (!allowedPosterUrl(target)) throw Error('Adresse de poster refusée.');
        response = await this.request(target, {
          signal: AbortSignal.timeout(15000),
          redirect: 'manual',
        });
        if (response.status < 300 || response.status >= 400) break;
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw Error('Redirection sans destination.');
        target = new URL(location, target).href;
      }
      const contentType = response?.headers.get('content-type')?.split(';')[0].trim() || '';
      if (!response?.ok || !IMAGE_TYPES.has(contentType) || !response.body)
        throw Error('Poster indisponible.');
      if (Number(response.headers.get('content-length')) > MAX_BYTES) {
        await response.body.cancel();
        throw Error('Poster trop volumineux.');
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) throw Error('Poster trop volumineux.');
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      if (!size) throw Error('Poster vide.');
      const bytes = Buffer.concat(chunks);
      const entry: CachedPoster = {
        url,
        savedAt: this.now(),
        contentType,
        base64: bytes.toString('base64'),
      };
      await fs.mkdir(this.options.directory, { recursive: true });
      const temporary = file + '.' + randomUUID() + '.tmp';
      try {
        await fs.writeFile(temporary, JSON.stringify(entry), { flag: 'wx' });
        await fs.rename(temporary, file);
      } finally {
        await fs.unlink(temporary).catch(() => {});
      }
      return { bytes, contentType };
    } catch {
      return cached ? decode(cached) : undefined;
    }
  }
}
