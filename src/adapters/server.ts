import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalLibrary } from './local-library.js';
import { SteamWorkshop } from './steam.js';
import { ModService } from '../application/service.js';
import { PosterCache } from './poster-cache.js';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
const library = new LocalLibrary();
await library.init();
const service = new ModService(
  library,
  new SteamWorkshop({ cacheFile: path.join(root, '.cache/workshop.json') }),
  new PosterCache({ directory: path.join(root, '.cache/posters') }),
);
app.addHook('onRequest', async (req, reply) => {
  const host = req.headers.host;
  if (!host || !/^(?:127\.0\.0\.1|localhost):\d+$/.test(host))
    return reply.code(403).send({ error: 'Hôte refusé.' });
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (
      req.headers.origin !== `http://${host}` ||
      !req.headers['content-type']?.startsWith('application/json')
    )
      return reply.code(403).send({ error: 'Origine refusée.' });
  }
});
app.setErrorHandler((error, req, reply) => {
  const message = error instanceof Error ? error.message : 'Erreur inattendue.';
  console.error(message);
  reply.code(400).send({ error: message });
});
app.get('/api/overview', async (req) => {
  const { save } = req.query as { save?: string };
  return service.overview(save);
});
app.post('/api/workshop', async (req) => {
  const { ids } = req.body as { ids: unknown };
  if (!Array.isArray(ids) || ids.length > 50 || ids.some((i) => typeof i !== 'string'))
    throw Error('Identifiants invalides.');
  return service.details(ids);
});
app.post('/api/remove', async (req) => {
  const { saveId, ids, revision } = req.body as {
    saveId: string;
    ids: string[];
    revision: string;
  };
  if (
    typeof saveId !== 'string' ||
    typeof revision !== 'string' ||
    !Array.isArray(ids) ||
    ids.some((i) => typeof i !== 'string')
  )
    throw Error('Requête invalide.');
  return service.remove(saveId, ids, revision);
});
for (const route of ['reorder', 'reorder/validate']) {
  app.post(`/api/${route}`, async (req) => {
    const body = req.body as { saveId?: unknown; ids?: unknown; revision?: unknown } | null;
    if (
      !body ||
      typeof body.saveId !== 'string' ||
      typeof body.revision !== 'string' ||
      !Array.isArray(body.ids) ||
      body.ids.length > 10000 ||
      body.ids.some((id) => typeof id !== 'string')
    )
      throw Error('Requête invalide.');
    return route === 'reorder'
      ? service.reorder(body.saveId, body.ids, body.revision)
      : service.validateOrder(body.saveId, body.ids, body.revision);
  });
}
app.get('/api/workshop/:id/poster', async (req, reply) => {
  const poster = await service.poster((req.params as { id: string }).id);
  if (!poster) return reply.code(404).send();
  const etag = '"' + createHash('sha256').update(poster.bytes).digest('hex') + '"';
  reply
    .header('ETag', etag)
    .header('Cache-Control', 'private, max-age=3600')
    .header('X-Content-Type-Options', 'nosniff');
  if (req.headers['if-none-match'] === etag) return reply.code(304).send();
  return reply.type(poster.contentType).send(Buffer.from(poster.bytes));
});
app.get('/api/image/:key', async (req, reply) => {
  const p = await service.image((req.params as { key: string }).key);
  if (!p) return reply.code(404).send();
  const ext = path.extname(p).toLowerCase();
  const mime: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  if (!mime[ext]) return reply.code(415).send();
  return reply
    .type(mime[ext])
    .header('Cache-Control', 'private, max-age=3600')
    .send(await fs.readFile(p));
});
await app.register(fastifyStatic, { root: path.join(root, 'dist') });
await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT || 4273) });
console.log('PZ Mods : http://127.0.0.1:' + (process.env.PORT || 4273));
