import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTransfer, parseDedicatedServer } from '../src/domain/transfers.js';
import { TransferService } from '../src/application/transfers.js';
import type { LibraryPort } from '../src/application/service.js';
import type { Mod } from '../src/domain/mods.js';

const mod = (id: string, workshopId?: string): Mod => ({
  id,
  workshopId,
  name: `Name ${id}`,
  description: '',
  source: 'fixture',
  requires: [],
  incompatible: [],
  variants: [],
});

test('export preserves interleaved sub-mod order and deduplicates parents by first appearance', () => {
  const result = buildTransfer(
    ['A', 'B', 'AOption', 'Local'],
    [mod('A', '123'), mod('B', '456'), mod('AOption', '123'), mod('Local')],
  );
  assert.equal(result.serverText, 'Mods=A;B;AOption;Local\nWorkshopItems=123;456\n');
  assert.deepEqual(result.manifest.workshopIds, ['123', '456']);
  assert.deepEqual(result.manifest.warnings, [{ kind: 'local', modId: 'Local' }]);
  assert.equal(result.manifest.mods[3].status, 'local');
});

test('qualified IDs impose providers while duplicate copies do not invent ambiguity', () => {
  const installed = [
    mod('A', '123'),
    mod('A', '456'),
    mod('B', '123'),
    mod('B', '123'),
    mod('C'),
    mod('C', '789'),
  ];
  const result = buildTransfer(['\\456/A', 'A', 'B', 'C', 'Missing'], installed);
  assert.deepEqual(
    result.manifest.mods.map((mod) => mod.status),
    ['workshop', 'ambiguous', 'workshop', 'ambiguous', 'missing'],
  );
  assert.deepEqual(result.manifest.workshopIds, ['456', '123']);
  assert.equal(result.manifest.mods[0].rawId, '\\456/A');
  assert.equal(result.manifest.mods[1].workshopId, undefined);
  assert.equal(result.manifest.mods[3].workshopId, undefined);
});

test('server parser whitelists keys, preserves explicit parent order and never pairs by position', () => {
  const text =
    'Password=DO_NOT_EXPORT\nAdminPassword=ALSO_PRIVATE\n[server]\nmOdS=B;A;Unknown\nWORKSHOPITEMS=999;123;999\nPublicName=PRIVATE_NAME\n';
  const parsed = parseDedicatedServer(text);
  assert.deepEqual(parsed, { ids: ['B', 'A', 'Unknown'], workshopIds: ['999', '123'] });
  const result = buildTransfer(parsed.ids, [mod('A', '123'), mod('B', '456')], parsed.workshopIds);
  assert.deepEqual(result.manifest.workshopIds, ['999', '123']);
  assert.equal(result.manifest.mods[0].workshopId, '456');
  assert.ok(
    result.manifest.warnings.some(
      (issue) => issue.kind === 'workshop-not-listed' && issue.modId === 'B',
    ),
  );
  assert.doesNotMatch(JSON.stringify(result), /DO_NOT_EXPORT|ALSO_PRIVATE|PRIVATE_NAME|Password/);
});

test('parser rejects duplicate directives, invalid Workshop IDs and excessive input without echoing configuration', () => {
  for (const text of [
    'Mods=A\nmods=B',
    'WorkshopItems=123\nWorkshopItems=456',
    'WorkshopItems=ABC',
    'WorkshopItems=0',
    'WorkshopItems=18446744073709551616',
    'Mods=' + 'A'.repeat(1024 * 1024),
    'Mods=' + Array(10001).fill('A').join(';'),
  ]) {
    assert.throws(() => parseDedicatedServer(text));
  }
  assert.deepEqual(parseDedicatedServer('Mods=\nWorkshopItems='), { ids: [], workshopIds: [] });
});

test('transfer service checks save revision and import performs no writes', async () => {
  const library: LibraryPort = {
    readSave: async () => ({ ids: ['A'], revision: 'current', version: '42.13' }),
    scan: async () => [mod('A', '123')],
    saves: async () => [],
    image: async () => undefined,
    status: async () => ({}),
    remove: async () => {
      throw Error('Unexpected write');
    },
    reorder: async () => {
      throw Error('Unexpected write');
    },
  };
  const service = new TransferService(library);
  await assert.rejects(service.exportSave('save', 'stale'), /changé/);
  assert.equal(
    (await service.exportSave('save', 'current')).serverText,
    'Mods=A\nWorkshopItems=123\n',
  );
  assert.equal(
    (await service.importServer('Mods=A\nWorkshopItems=999')).manifest.workshopIds[0],
    '999',
  );
});
