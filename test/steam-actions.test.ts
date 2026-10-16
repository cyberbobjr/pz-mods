import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SteamActionsService,
  type SteamAccountPort,
  type SteamCatalogPort,
} from '../src/application/steam-actions.js';
import { SteamCatalog } from '../src/adapters/steam-catalog.js';

function account(overrides: Partial<SteamAccountPort> = {}): SteamAccountPort {
  return {
    status: async () => ({ available: true, connected: true }),
    connect: async () => ({ available: true, connected: true }),
    subscribe: async () => 'subscribed',
    beginCollection: async () => {},
    detectCollection: async () => '999',
    addToCollection: async () => {},
    ...overrides,
  };
}
const catalog: SteamCatalogPort = {
  inspect: async (ids) =>
    Object.fromEntries(ids.map((id) => [id, { appId: 108600, collection: false }])),
};

test('Steam actions deduplicate IDs, reject unverified items and report partial failures', async () => {
  const called: string[] = [];
  const service = new SteamActionsService(
    account({
      subscribe: async (id) => {
        called.push(id);
        return id === '123' ? 'alreadySubscribed' : 'subscribed';
      },
    }),
    {
      inspect: async () => ({
        '123': { appId: 108600, collection: false },
        '456': { appId: 108600, collection: false },
        '789': { appId: 42, collection: false },
        '999': { appId: 108600, collection: true },
      }),
    },
  );
  const result = await service.subscribe(['123', '123', '456', '789', '999', '888']);
  assert.deepEqual(called, ['123', '456']);
  assert.deepEqual(result.subscribed, ['456']);
  assert.deepEqual(result.alreadySubscribed, ['123']);
  assert.deepEqual(
    result.failed.map((item) => item.id),
    ['789', '999', '888'],
  );
  assert.equal((await service.status()).busy, false);
});

test('Steam actions enforce login, numeric ID bounds, collection inputs and operation lock', async () => {
  const disconnected = new SteamActionsService(
    account({ status: async () => ({ available: true, connected: false }) }),
    catalog,
  );
  await assert.rejects(disconnected.subscribe(['123']), /Connectez/);
  const service = new SteamActionsService(account(), catalog);
  for (const ids of [
    [],
    ['0'],
    ['01'],
    ['-1'],
    ['abc'],
    ['18446744073709551616'],
    Array(11).fill('123'),
  ])
    await assert.rejects(service.subscribe(ids), /invalide/);
  await assert.rejects(service.beginCollection(' '), /titre/);
  await assert.rejects(service.add(['123'], '0'), /collection invalide/);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locked = new SteamActionsService(
    account({
      connect: async () => {
        await pending;
        return { available: true, connected: true };
      },
    }),
    catalog,
  );
  const connect = locked.connect();
  assert.equal((await locked.status()).busy, true);
  await assert.rejects(locked.connect(), /en cours/);
  await assert.rejects(locked.subscribe(['123']), /en cours/);
  release();
  await connect;
  assert.equal((await locked.status()).busy, false);
});

test('collection actions trim titles, report detection and preserve per-item failures', async () => {
  const titles: string[] = [];
  const added: string[] = [];
  const service = new SteamActionsService(
    account({
      beginCollection: async (title) => {
        titles.push(title);
      },
      addToCollection: async (collection, id) => {
        assert.equal(collection, '999');
        if (id === '456') throw Error('Fixture failure');
        added.push(id);
      },
    }),
    catalog,
  );
  assert.deepEqual(await service.beginCollection('  My collection  '), { pending: true });
  assert.deepEqual(titles, ['My collection']);
  assert.deepEqual(await service.detectCollection(), { id: '999' });
  const result = await service.add(['123', '456', '999'], '999');
  assert.deepEqual(added, ['123']);
  assert.deepEqual(result.added, ['123']);
  assert.deepEqual(
    result.failed.map((item) => item.id),
    ['456', '999'],
  );
});

test('Steam catalog uses injected public transport and filters invalid or unsolicited results', async () => {
  const adapter = new SteamCatalog(async (url, init) => {
    assert.equal(
      String(url),
      'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/',
    );
    assert.equal(init?.method, 'POST');
    assert.equal((init?.body as URLSearchParams).get('publishedfileids[0]'), '123');
    return new Response(
      JSON.stringify({
        response: {
          publishedfiledetails: [
            { publishedfileid: '123', result: 1, consumer_app_id: 108600, file_type: 0 },
            { publishedfileid: '456', result: 1, consumer_app_id: 108600, file_type: 2 },
            { publishedfileid: '789', result: 9, consumer_app_id: 108600 },
            { publishedfileid: '888', result: 1, consumer_app_id: '108600' },
            { publishedfileid: '999', result: 1, consumer_app_id: 108600 },
          ],
        },
      }),
    );
  });
  assert.deepEqual(await adapter.inspect(['123', '456', '789', '888']), {
    '123': { appId: 108600, collection: false },
    '456': { appId: 108600, collection: true },
  });
  await assert.rejects(
    new SteamCatalog(async () => new Response('', { status: 503 })).inspect(['123']),
    /Steam/,
  );
});
