import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SteamAccount } from '../src/adapters/steam-account.js';

type FixtureOptions = { alreadyPresent?: boolean; confirmed?: boolean; explicitError?: boolean };
type RecordedCall = { endpoint: string; values: Record<string, string> };

function fixture({
  alreadyPresent = false,
  confirmed = true,
  explicitError = false,
}: FixtureOptions = {}) {
  const account = new SteamAccount('unused-fixture-profile');
  const calls: RecordedCall[] = [];
  let added = false;
  // Replace only the browser transport in this fixture. No authentication,
  // browser launch, network request or profile filesystem access can occur.
  Object.defineProperty(account, 'request', {
    value: async (endpoint: string, values: Record<string, string>) => {
      calls.push({ endpoint, values });
      if (endpoint === '/sharedfiles/ajaxaddtocollections') {
        added = true;
        return explicitError ? { success: 0 } : {};
      }
      assert.equal(endpoint, '/sharedfiles/ajaxgetmycollections');
      assert.equal(values.appid, '108600');
      if (!values.publishedfileid) {
        return {
          all_collections: {
            publishedfiledetails: [{ publishedfileid: '999', title: 'Fixture collection' }],
          },
        };
      }
      assert.equal(values.publishedfileid, '123');
      return {
        parent_collections:
          alreadyPresent || (added && confirmed)
            ? { publishedfiledetails: [{ publishedfileid: '999' }] }
            : {},
      };
    },
  });
  return { account, calls };
}

test('collection addition accepts an empty success object only after membership readback', async () => {
  const { account, calls } = fixture();
  await account.addToCollection('999', '123');
  assert.deepEqual(
    calls.map((call) => call.endpoint),
    [
      '/sharedfiles/ajaxgetmycollections',
      '/sharedfiles/ajaxgetmycollections',
      '/sharedfiles/ajaxaddtocollections',
      '/sharedfiles/ajaxgetmycollections',
    ],
  );
  assert.deepEqual(calls[2].values, {
    publishedfileid: '123',
    'collections[999][add]': 'true',
    'collections[999][title]': 'Fixture collection',
  });
  assert.equal(calls[3].values.publishedfileid, '123');
});

test('existing collection membership skips the addition request', async () => {
  const { account, calls } = fixture({ alreadyPresent: true });
  await account.addToCollection('999', '123');
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.endpoint === '/sharedfiles/ajaxgetmycollections'));
});

test('unconfirmed collection membership rejects even when the addition returned HTTP success', async () => {
  const { account, calls } = fixture({ confirmed: false });
  await assert.rejects(account.addToCollection('999', '123'), /Steam/);
  assert.equal(calls.length, 4);
});

test('explicit addition errors reject without presenting membership as confirmed', async () => {
  const { account, calls } = fixture({ explicitError: true });
  await assert.rejects(account.addToCollection('999', '123'), /Steam/);
  assert.equal(calls.length, 3);
});
