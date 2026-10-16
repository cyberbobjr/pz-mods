import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import type { SteamAccountPort } from '../application/steam-actions.js';

type SteamReply = {
  success?: number | boolean;
  results?: { success?: number | boolean; error?: string }[];
  error?: string;
};
type OwnCollection = { publishedfileid: string; title: string; result?: number };
const ORIGIN = 'https://steamcommunity.com';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class SteamAccount implements SteamAccountPort {
  private context?: BrowserContext;
  private page?: Page;
  private lastRequest = 0;
  private retryAfter = 0;
  constructor(private readonly profile: string) {}
  private async channel(): Promise<'msedge' | 'chrome' | undefined> {
    const candidates = [
      [
        'msedge',
        path.join(
          process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)',
          'Microsoft/Edge/Application/msedge.exe',
        ),
      ],
      [
        'msedge',
        path.join(
          process.env.PROGRAMFILES || 'C:/Program Files',
          'Microsoft/Edge/Application/msedge.exe',
        ),
      ],
      [
        'chrome',
        path.join(
          process.env.PROGRAMFILES || 'C:/Program Files',
          'Google/Chrome/Application/chrome.exe',
        ),
      ],
      ['chrome', path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe')],
    ] as const;
    for (const [channel, executable] of candidates)
      if (
        await fs
          .access(executable)
          .then(() => true)
          .catch(() => false)
      )
        return channel;
    return undefined;
  }
  async status() {
    const available = !!(await this.channel());
    const page = this.page;
    const connected =
      page && !page.isClosed() && new URL(page.url()).origin === ORIGIN
        ? await page
            .evaluate(() => {
              const state = window as unknown as { g_steamID?: unknown };
              return typeof state.g_steamID === 'string' && /^[1-9]\d*$/.test(state.g_steamID);
            })
            .catch(() => false)
        : false;
    return { available, connected: !!connected };
  }
  async connect() {
    if (this.page && !this.page.isClosed()) {
      await this.page.bringToFront();
      return this.status();
    }
    const channel = await this.channel();
    if (!channel)
      throw Error('Microsoft Edge ou Google Chrome est nécessaire pour la connexion Steam.');
    try {
      this.context = await chromium.launchPersistentContext(this.profile, {
        channel,
        headless: false,
        viewport: null,
        args: ['--disable-save-password-bubble'],
      });
      this.page = this.context.pages()[0] || (await this.context.newPage());
      await this.page.goto(ORIGIN + '/login/home/?goto=app%2F108600%2Fworkshop%2F', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await this.page.bringToFront();
      return this.status();
    } catch {
      await this.close();
      throw Error(
        'Impossible d’ouvrir le navigateur Steam dédié. Fermez ses autres fenêtres et réessayez.',
      );
    }
  }
  private async authenticatedPage() {
    if (!(await this.status()).connected || !this.page)
      throw Error('Connectez-vous à Steam dans le navigateur dédié.');
    return this.page;
  }
  private async throttle() {
    if (Date.now() < this.retryAfter)
      throw Error('Steam limite les requêtes. Réessayez plus tard.');
    const wait = 350 - (Date.now() - this.lastRequest);
    if (wait > 0) await sleep(wait);
    this.lastRequest = Date.now();
  }
  private async request(
    endpoint:
      | '/sharedfiles/subscribe'
      | '/sharedfiles/ajaxgetmycollections'
      | '/sharedfiles/ajaxaddtocollections',
    values: Record<string, string>,
  ) {
    const page = await this.authenticatedPage();
    await this.throttle();
    const result = await page.evaluate(
      async ({ endpoint, values }) => {
        const state = window as unknown as { g_sessionID?: string };
        if (!state.g_sessionID) return { ok: false, rateLimited: false, data: null };
        const parameters = new URLSearchParams(values);
        parameters.set(
          endpoint.endsWith('ajaxaddtocollections') ? 'sessionID' : 'sessionid',
          state.g_sessionID,
        );
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          body: parameters,
          signal: AbortSignal.timeout(20000),
        });
        return {
          ok: response.ok,
          rateLimited: response.status === 429,
          data: (await response.json().catch(() => null)) as unknown,
        };
      },
      { endpoint, values },
    );
    if (result.rateLimited) this.retryAfter = Date.now() + 60000;
    if (!result.ok || (!result.data && endpoint !== '/sharedfiles/ajaxaddtocollections'))
      throw Error(
        result.rateLimited
          ? 'Steam limite les requêtes. Réessayez plus tard.'
          : 'Steam n’a pas confirmé cette action.',
      );
    return result.data || {};
  }
  async subscribe(id: string): Promise<'subscribed' | 'alreadySubscribed'> {
    const page = await this.authenticatedPage();
    await this.throttle();
    const state = await page.evaluate(async (id) => {
      const response = await fetch('/sharedfiles/filedetails/?id=' + id + '&l=english', {
        credentials: 'same-origin',
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok)
        return { rateLimited: response.status === 429, subscribed: false, ok: false };
      const document = new DOMParser().parseFromString(await response.text(), 'text/html');
      return {
        rateLimited: false,
        subscribed: !!document.querySelector('#SubscribeItemBtn.toggled'),
        ok: true,
      };
    }, id);
    if (state.rateLimited) {
      this.retryAfter = Date.now() + 60000;
      throw Error('Steam limite les requêtes. Réessayez plus tard.');
    }
    if (!state.ok) throw Error('Impossible de vérifier l’abonnement Steam.');
    if (state.subscribed) return 'alreadySubscribed';
    const result = (await this.request('/sharedfiles/subscribe', {
      id,
      appid: '108600',
      include_dependencies: 'false',
    })) as SteamReply;
    if (result.success !== 1 && result.success !== true)
      throw Error('Steam n’a pas confirmé cet abonnement.');
    return 'subscribed';
  }
  async beginCollection(title: string) {
    const page = await this.authenticatedPage();
    await page.goto(ORIGIN + '/sharedfiles/editcollection/?appid=108600&l=english', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    const titleField = page.locator('input[name="title"], input#title').first();
    if (await titleField.count()) await titleField.fill(title);
    const visibility = page.locator('select[name="visibility"]').first();
    if ((await visibility.count()) && (await visibility.locator('option[value="2"]').count()))
      await visibility.selectOption('2');
    await page.bringToFront();
  }
  private async ownCollections(): Promise<OwnCollection[]> {
    const result = (await this.request('/sharedfiles/ajaxgetmycollections', {
      appid: '108600',
    })) as { all_collections?: { publishedfiledetails?: OwnCollection[] } };
    return (result.all_collections?.publishedfiledetails || []).filter(
      (item) => item.result === undefined || item.result === 1,
    );
  }
  private async belongsToCollection(collectionId: string, itemId: string) {
    const result = (await this.request('/sharedfiles/ajaxgetmycollections', {
      appid: '108600',
      publishedfileid: itemId,
    })) as {
      parent_collections?: {
        publishedfiledetails?: { publishedfileid: string; result?: number }[];
      };
    };
    const parentCollections = result.parent_collections;
    if (!parentCollections || typeof parentCollections !== 'object')
      throw Error('Impossible de vérifier le contenu de la collection Steam.');
    const parents = parentCollections.publishedfiledetails ?? [];
    if (!Array.isArray(parents))
      throw Error('Impossible de vérifier le contenu de la collection Steam.');
    return parents.some(
      (item) =>
        item.publishedfileid === collectionId && (item.result === undefined || item.result === 1),
    );
  }
  async detectCollection() {
    const page = await this.authenticatedPage();
    const url = new URL(page.url());
    const id = url.searchParams.get('id');
    if (
      !id ||
      !/^\d+$/.test(id) ||
      !/\/(?:sharedfiles|workshop)\/(?:filedetails|editcollection)/.test(url.pathname)
    )
      return undefined;
    return (await this.ownCollections()).some((collection) => collection.publishedfileid === id)
      ? id
      : undefined;
  }
  async addToCollection(collectionId: string, id: string) {
    const collection = (await this.ownCollections()).find(
      (item) => item.publishedfileid === collectionId,
    );
    if (!collection) throw Error('Collection Project Zomboid introuvable dans votre compte Steam.');
    if (await this.belongsToCollection(collectionId, id)) return;
    const result = (await this.request('/sharedfiles/ajaxaddtocollections', {
      publishedfileid: id,
      [`collections[${collectionId}][add]`]: 'true',
      [`collections[${collectionId}][title]`]: collection.title,
    })) as SteamReply;
    if (
      result.success === 0 ||
      result.success === false ||
      result.error ||
      result.results?.some((item) => item.error || item.success === 0 || item.success === false)
    )
      throw Error('Steam n’a pas confirmé l’ajout à la collection.');
    if (!(await this.belongsToCollection(collectionId, id))) {
      throw Error('Steam n’a pas confirmé l’ajout à la collection.');
    }
  }
  async close() {
    await this.context?.close().catch(() => {});
    this.context = undefined;
    this.page = undefined;
  }
}
