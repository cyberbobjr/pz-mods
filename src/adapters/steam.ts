import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WorkshopPort } from '../application/service.js';
import type { WorkshopDetail } from '../domain/mods.js';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RETRY_COOLDOWN_MS = 60 * 1000;
interface SteamWorkshopOptions {
  cacheFile?: string;
  fetch?: typeof fetch;
  now?: () => number;
}
function isFreshDetail(value: unknown, now: number): value is WorkshopDetail {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<WorkshopDetail>;
  return (
    typeof item.title === 'string' &&
    typeof item.description === 'string' &&
    typeof item.preview_url === 'string' &&
    typeof item.time_updated === 'number' &&
    Number.isFinite(item.time_updated) &&
    item.time_updated > 0 &&
    typeof item.fetchedAt === 'number' &&
    Number.isFinite(item.fetchedAt) &&
    now >= item.fetchedAt &&
    now - item.fetchedAt < CACHE_TTL_MS
  );
}
function isReadableDetail(value: unknown): value is WorkshopDetail {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<WorkshopDetail>;
  return (
    typeof item.title === 'string' &&
    typeof item.description === 'string' &&
    typeof item.preview_url === 'string'
  );
}
export class SteamWorkshop implements WorkshopPort {
  private cache: Record<string, WorkshopDetail> = {};
  private loaded = false;
  private pending: Promise<void> = Promise.resolve();
  private queue: Promise<unknown> = Promise.resolve();
  private retryAfter = 0;
  private readonly inflight = new Map<string, Promise<Record<string, WorkshopDetail>>>();
  private readonly file: string;
  private readonly request: typeof fetch;
  private readonly now: () => number;
  constructor(options: SteamWorkshopOptions = {}) {
    this.file = options.cacheFile || path.resolve('.cache/workshop.json');
    this.request = options.fetch || fetch;
    this.now = options.now || Date.now;
  }
  async details(ids: string[]) {
    const valid = [...new Set(ids.filter((id) => /^\d+$/.test(id)))].sort().slice(0, 50);
    const key = valid.join(',');
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const task = this.queue
      .catch(() => {})
      .then(() => this.readDetails(valid))
      .finally(() => this.inflight.delete(key));
    this.queue = task;
    this.inflight.set(key, task);
    return task;
  }
  private async readDetails(ids: string[]) {
    if (!this.loaded) {
      try {
        const cached: unknown = JSON.parse(await fs.readFile(this.file, 'utf8'));
        if (cached && typeof cached === 'object' && !Array.isArray(cached)) {
          this.cache = Object.fromEntries(
            Object.entries(cached).filter(
              ([id, item]) => /^\d+$/.test(id) && isReadableDetail(item),
            ),
          );
        }
      } catch {
        // A missing or interrupted cache never prevents fresh Workshop requests.
        this.cache = {};
      }
      this.loaded = true;
    }
    const valid = [...new Set(ids.filter((id) => /^\d+$/.test(id)))].slice(0, 50);
    const missing = valid.filter((id) => !isFreshDetail(this.cache[id], this.now()));
    if (missing.length && this.now() < this.retryAfter && valid.every((id) => !this.cache[id])) {
      throw Error('Steam est indisponible. Les informations locales restent disponibles.');
    }
    if (missing.length && this.now() >= this.retryAfter) {
      let remoteCompleted = false;
      try {
        const body = new URLSearchParams({ itemcount: String(missing.length) });
        missing.forEach((id, i) => body.set(`publishedfileids[${i}]`, id));
        const response = await this.request(
          'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/',
          { method: 'POST', body, signal: AbortSignal.timeout(20000) },
        );
        if (!response.ok)
          throw Error('Steam est indisponible. Les informations locales restent disponibles.');
        const data = (await response.json()) as {
          response: {
            publishedfiledetails: ({
              publishedfileid: string;
              result: number;
            } & WorkshopDetail)[];
          };
        };
        for (const item of data.response.publishedfiledetails || [])
          if (item.result === 1 && missing.includes(item.publishedfileid) && isReadableDetail(item))
            this.cache[item.publishedfileid] = {
              title: item.title,
              description: item.description,
              preview_url: /^https:\/\//.test(item.preview_url) ? item.preview_url : '',
              time_updated: item.time_updated,
              fetchedAt: this.now(),
            };
        remoteCompleted = true;
        this.retryAfter = 0;
        this.pending = this.pending
          .catch(() => {})
          .then(async () => {
            await fs.mkdir(path.dirname(this.file), { recursive: true });
            const temporary = `${this.file}.${randomUUID()}.tmp`;
            try {
              await fs.writeFile(temporary, JSON.stringify(this.cache), { flag: 'wx' });
              await fs.rename(temporary, this.file);
            } finally {
              await fs.unlink(temporary).catch(() => {});
            }
          });
        await this.pending;
      } catch {
        if (!remoteCompleted) this.retryAfter = this.now() + RETRY_COOLDOWN_MS;
        if (valid.every((id) => !this.cache[id])) {
          throw Error('Steam est indisponible. Les informations locales restent disponibles.');
        }
      }
    }
    return Object.fromEntries(
      valid
        .filter((id) => this.cache[id])
        .map((id) => [
          id,
          { ...this.cache[id], cacheStale: !isFreshDetail(this.cache[id], this.now()) },
        ]),
    );
  }
}
