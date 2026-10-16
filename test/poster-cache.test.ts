import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { allowedPosterUrl, PosterCache } from '../src/adapters/poster-cache';

test('poster cache coalesces downloads, survives restart and serves stale images offline', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-posters-'));
  try {
    let calls = 0;
    let now = Date.now();
    const request = (async () => {
      calls++;
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { 'Content-Type': 'image/png' },
      });
    }) as typeof fetch;
    const url = 'https://images.steamusercontent.com/poster.png';
    const cache = new PosterCache({ directory, request, now: () => now });
    const results = await Promise.all([cache.get(url), cache.get(url)]);
    assert.equal(calls, 1);
    assert.deepEqual(results[0]?.bytes, Buffer.from([137, 80, 78, 71]));
    const restarted = new PosterCache({ directory, request, now: () => now });
    await restarted.get(url);
    assert.equal(calls, 1);
    now += 8 * 24 * 60 * 60 * 1000;
    const offline = new PosterCache({
      directory,
      now: () => now,
      request: (async () => {
        throw Error('offline');
      }) as typeof fetch,
    });
    assert.deepEqual((await offline.get(url))?.bytes, results[0]?.bytes);
    await restarted.get(url + '?updated=1');
    assert.equal(calls, 2);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('poster cache rejects non-Steam addresses and redirect escapes', async () => {
  assert.equal(allowedPosterUrl('https://steamstatic.com.evil.test/poster.png'), false);
  assert.equal(allowedPosterUrl('http://cdn.steamstatic.com/poster.png'), false);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-posters-'));
  try {
    let calls = 0;
    const cache = new PosterCache({
      directory,
      request: (async () => {
        calls++;
        return new Response(null, {
          status: 302,
          headers: { Location: 'http://127.0.0.1/private' },
        });
      }) as typeof fetch,
    });
    assert.equal(await cache.get('http://127.0.0.1/private'), undefined);
    assert.equal(calls, 0);
    assert.equal(await cache.get('https://cdn.steamstatic.com/poster.png'), undefined);
    assert.equal(calls, 1);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('poster cache does not persist HTML or corrupted entries', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-posters-'));
  try {
    const cache = new PosterCache({
      directory,
      request: (async () =>
        new Response('<html>Error</html>', {
          headers: { 'Content-Type': 'text/html' },
        })) as typeof fetch,
    });
    assert.equal(await cache.get('https://cdn.steamstatic.com/poster.png'), undefined);
    assert.deepEqual(await fs.readdir(directory), []);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
