import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SteamWorkshop } from '../src/adapters/steam.js';

test('expired disk metadata survives offline requests with an explicit stale marker', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-steam-offline-'));
  try {
    const cacheFile = path.join(root, 'cache.json');
    const cached = {
      title: 'Cached',
      description: 'Keep this',
      preview_url: 'https://example.com/image.png',
      time_updated: 123,
      fetchedAt: 1,
    };
    await fs.writeFile(cacheFile, JSON.stringify({ '123': cached }));
    const workshop = new SteamWorkshop({
      cacheFile,
      now: () => 1_800_000_000_000,
      fetch: async () => {
        throw Error('Offline');
      },
    });
    const result = await workshop.details(['123', '456']);
    assert.deepEqual(result['123'], { ...cached, cacheStale: true });
    assert.equal(result['456'], undefined);
    assert.deepEqual(JSON.parse(await fs.readFile(cacheFile, 'utf8')), { '123': cached });
    await assert.rejects(workshop.details(['456']), /Steam/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('concurrent identical requests coalesce and atomic writes leave a reusable cache', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-steam-concurrent-'));
  try {
    const cacheFile = path.join(root, 'cache.json');
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls++;
      return new Response(
        JSON.stringify({
          response: {
            publishedfiledetails: [
              {
                publishedfileid: '123',
                result: 1,
                title: 'Fresh',
                description: 'Description',
                preview_url: '',
                time_updated: 123,
              },
            ],
          },
        }),
      );
    };
    const workshop = new SteamWorkshop({ cacheFile, fetch: fetcher });
    const results = await Promise.all([
      workshop.details(['123']),
      workshop.details(['123']),
      workshop.details(['123']),
    ]);
    assert.equal(calls, 1);
    assert.deepEqual(results[0], results[1]);
    assert.equal(results[0]['123'].cacheStale, false);
    assert.deepEqual(await fs.readdir(root), ['cache.json']);
    const reloaded = new SteamWorkshop({
      cacheFile,
      fetch: async () => {
        throw Error('Unexpected request');
      },
    });
    assert.equal((await reloaded.details(['123']))['123'].cacheStale, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('offline cooldown suppresses requests across IDs until sixty seconds have elapsed', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-steam-cooldown-'));
  try {
    const cacheFile = path.join(root, 'cache.json');
    await fs.writeFile(
      cacheFile,
      JSON.stringify({
        '123': {
          title: 'Cached',
          description: '',
          preview_url: '',
          time_updated: 123,
          fetchedAt: 1,
        },
        '456': {
          title: 'Other',
          description: '',
          preview_url: '',
          time_updated: 123,
          fetchedAt: 1,
        },
      }),
    );
    let now = 1_800_000_000_000;
    let calls = 0;
    const workshop = new SteamWorkshop({
      cacheFile,
      now: () => now,
      fetch: async () => {
        calls++;
        throw Error('Offline');
      },
    });
    assert.equal((await workshop.details(['123']))['123'].cacheStale, true);
    assert.equal((await workshop.details(['456']))['456'].cacheStale, true);
    await assert.rejects(workshop.details(['789']), /Steam/);
    assert.equal(calls, 1);
    now += 59_999;
    await workshop.details(['123']);
    assert.equal(calls, 1);
    now++;
    await workshop.details(['456']);
    assert.equal(calls, 2);
    await assert.rejects(workshop.details(['789']), /Steam/);
    assert.equal(calls, 2);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
