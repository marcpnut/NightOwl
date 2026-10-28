import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getCatalog, listCatalog, loadProvider, pool } from './database.js';
import { playbackUrl } from './provider.js';
import { tokenMatches } from './security.js';

const pageQuery = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(20).default(20), category: z.string().max(80).optional() });
const idParam = z.object({ id: z.string().regex(/^\d+$/) });
const profileParam = z.object({ id: z.string().uuid() });
const profileName = z.object({ name: z.string().trim().min(1).max(24) });
const listInput = z.object({ kind: z.enum(['movie', 'series']), id: z.string().regex(/^\d+$/), saved: z.boolean() });
const progressInput = z.object({ kind: z.enum(['movie', 'episode', 'live']), id: z.string().regex(/^\d+$/), positionSeconds: z.number().int().min(0), durationSeconds: z.number().int().min(0).optional(), completed: z.boolean().default(false) });
const playbackInput = z.object({ kind: z.enum(['live', 'movie', 'episode']), id: z.string().regex(/^\d+$/), format: z.enum(['m3u8', 'ts']).optional() });
const deviceId = (request: FastifyRequest) => z.string().uuid().parse(request.headers['x-device-id']);
async function profileBelongsToDevice(profileId: string, device: string): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM profiles WHERE id=$1 AND device_id=$2', [profileId, device]);
  return (rowCount ?? 0) > 0;
}

export function makeApi(options: { apiToken: string; credentialKey: Buffer }) {
  const app = Fastify({ logger: { redact: ['req.headers.authorization', 'res.headers.location'] }, bodyLimit: 64 * 1024 });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'Invalid request.', details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) } });
    app.log.error(error);
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Request failed.' } });
  });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Device-Id');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    reply.header('Cache-Control', 'no-store');
    if (request.method === 'OPTIONS') return reply.code(204).send();
    if (request.url === '/api/v1/health') return;
    if (!tokenMatches(request.headers.authorization, options.apiToken)) return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    deviceId(request);
  });

  app.get('/api/v1/health', async () => {
    await pool.query('SELECT 1');
    return { status: 'ok' };
  });
  app.get('/api/v1/sync/status', async () => {
    const { rows } = await pool.query('SELECT dataset,status,cursor,last_attempt_at AS "lastAttemptAt",last_success_at AS "lastSuccessAt",last_error AS "lastError",row_count AS "rowCount" FROM sync_state ORDER BY dataset');
    return { datasets: rows };
  });
  app.get('/api/v1/home', async (request, reply) => {
    const profile = z.object({ profileId: z.string().uuid().optional() }).parse(request.query).profileId;
    if (profile && !(await profileBelongsToDevice(profile, deviceId(request)))) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Profile not found.' } });
    const [movies, series, recommendedMovies, recommendedSeries, categories] = await Promise.all([
      listCatalog('movie', 1, 12), listCatalog('series', 1, 12),
      pool.query(`SELECT kind,id,title,poster_url AS "posterUrl",backdrop_url AS "backdropUrl",description,rating FROM catalog WHERE kind='movie' AND active AND rating IS NOT NULL ORDER BY rating DESC NULLS LAST LIMIT 12`),
      pool.query(`SELECT kind,id,title,poster_url AS "posterUrl",backdrop_url AS "backdropUrl",description,rating FROM catalog WHERE kind='series' AND active AND rating IS NOT NULL ORDER BY rating DESC NULLS LAST LIMIT 12`),
      pool.query(`SELECT kind,id,name FROM categories WHERE active=true AND kind IN ('movie','series') ORDER BY name LIMIT 6`)
    ]);
    const rows: Array<{ id: string; title: string; items: unknown[] }> = [
      { id: 'recommended-movies', title: 'Recommended Movies', items: recommendedMovies.rows },
      { id: 'recommended-series', title: 'Recommended Series', items: recommendedSeries.rows },
      { id: 'recent-movies', title: 'Recently Added Movies', items: movies },
      { id: 'recent-series', title: 'Recently Added Series', items: series }
    ];
    if (profile) {
      const [watch, favorites] = await Promise.all([
        pool.query(`SELECT c.kind,c.id,c.title,c.poster_url AS "posterUrl",w.position_seconds AS "positionSeconds",w.duration_seconds AS "durationSeconds" FROM watch_progress w JOIN catalog c ON c.kind=w.kind AND c.id=w.catalog_id WHERE w.profile_id=$1 AND NOT w.completed AND c.active ORDER BY w.updated_at DESC LIMIT 12`, [profile]),
        pool.query(`SELECT c.kind,c.id,c.title,c.poster_url AS "posterUrl" FROM my_list m JOIN catalog c ON c.kind=m.kind AND c.id=m.catalog_id WHERE m.profile_id=$1 AND c.active ORDER BY m.created_at DESC LIMIT 12`, [profile])
      ]);
      rows.unshift({ id: 'continue', title: 'Continue Watching', items: watch.rows }, { id: 'my-list', title: 'My List', items: favorites.rows });
    }
    const genreRows = await Promise.all(categories.rows.map(async (category) => ({
      id: `${category.kind}:${category.id}`, title: category.name, items: await listCatalog(category.kind, 1, 12, category.id)
    })));
    rows.push(...genreRows.filter((entry) => entry.items.length));
    return { featured: movies[0] ?? series[0] ?? null, rows };
  });

  for (const [path, kind] of [['movies', 'movie'], ['series', 'series'], ['live', 'live']] as const) {
    app.get(`/api/v1/${path}`, async (request) => {
      const query = pageQuery.parse(request.query);
      const items = await listCatalog(kind, query.page, query.limit, query.category);
      return { items, page: query.page, limit: query.limit, hasMore: items.length === query.limit };
    });
  }
  app.get('/api/v1/movies/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const item = await getCatalog('movie', id);
    return item ?? reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Movie not found.' } });
  });
  app.get('/api/v1/series/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const item = await getCatalog('series', id);
    return item ?? reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Series not found.' } });
  });
  app.get('/api/v1/series/:id/seasons', async (request) => {
    const { id } = idParam.parse(request.params);
    const { rows } = await pool.query(`SELECT season_number AS number,count(*)::integer AS count FROM catalog WHERE kind='episode' AND parent_id=$1 AND active=true GROUP BY season_number ORDER BY season_number`, [id]);
    return { seasons: rows };
  });
  app.get('/api/v1/series/:id/seasons/:season/episodes', async (request) => {
    const params = z.object({ id: z.string().regex(/^\d+$/), season: z.coerce.number().int().min(0) }).parse(request.params);
    const query = pageQuery.parse(request.query);
    const { rows } = await pool.query(`SELECT kind,id,title,description,poster_url AS "posterUrl",season_number AS "seasonNumber",episode_number AS "episodeNumber",duration_seconds AS "durationSeconds" FROM catalog WHERE kind='episode' AND parent_id=$1 AND season_number=$2 AND active=true ORDER BY episode_number,id LIMIT $3 OFFSET $4`,
      [params.id, params.season, query.limit, (query.page - 1) * query.limit]);
    return { items: rows, page: query.page, hasMore: rows.length === query.limit };
  });
  app.get('/api/v1/live/categories', async () => {
    const { rows } = await pool.query(`SELECT id,name FROM categories WHERE kind='live' AND active=true ORDER BY name`);
    return { items: rows };
  });
  app.get('/api/v1/search', async (request) => {
    const query = pageQuery.extend({ q: z.string().trim().min(2).max(100) }).parse(request.query);
    const each = Math.min(10, Math.ceil(query.limit / 2));
    const [movies, series] = await Promise.all([listCatalog('movie', query.page, each, undefined, query.q), listCatalog('series', query.page, each, undefined, query.q)]);
    return { movies, series, page: query.page };
  });

  app.get('/api/v1/profiles', async (request) => {
    const { rows } = await pool.query('SELECT id,name,preferences FROM profiles WHERE device_id=$1 ORDER BY created_at', [deviceId(request)]);
    return { items: rows };
  });
  app.post('/api/v1/profiles', async (request, reply) => {
    const { name } = profileName.parse(request.body);
    const id = randomUUID();
    await pool.query('INSERT INTO profiles(id,device_id,name) VALUES($1,$2,$3)', [id, deviceId(request), name]);
    return reply.code(201).send({ id, name });
  });
  app.get('/api/v1/profiles/:id/continue-watching', async (request, reply) => {
    const { id } = profileParam.parse(request.params);
    if (!(await profileBelongsToDevice(id, deviceId(request)))) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Profile not found.' } });
    const { rows } = await pool.query(`SELECT w.kind,w.catalog_id AS id,w.position_seconds AS "positionSeconds",w.duration_seconds AS "durationSeconds",c.title,c.poster_url AS "posterUrl" FROM watch_progress w JOIN catalog c ON c.kind=w.kind AND c.id=w.catalog_id WHERE w.profile_id=$1 AND NOT w.completed AND c.active ORDER BY w.updated_at DESC LIMIT 20`, [id]);
    return { items: rows };
  });
  app.get('/api/v1/profiles/:id/my-list', async (request, reply) => {
    const { id } = profileParam.parse(request.params);
    if (!(await profileBelongsToDevice(id, deviceId(request)))) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Profile not found.' } });
    const { rows } = await pool.query(`SELECT c.kind,c.id,c.title,c.poster_url AS "posterUrl" FROM my_list m JOIN catalog c ON c.kind=m.kind AND c.id=m.catalog_id WHERE m.profile_id=$1 AND c.active ORDER BY m.created_at DESC LIMIT 20`, [id]);
    return { items: rows };
  });
  app.post('/api/v1/profiles/:id/my-list', async (request, reply) => {
    const { id: profileId } = profileParam.parse(request.params);
    if (!(await profileBelongsToDevice(profileId, deviceId(request)))) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Profile not found.' } });
    const body = listInput.parse(request.body);
    if (body.saved) await pool.query(`INSERT INTO my_list(profile_id,kind,catalog_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [profileId, body.kind, body.id]);
    else await pool.query(`DELETE FROM my_list WHERE profile_id=$1 AND kind=$2 AND catalog_id=$3`, [profileId, body.kind, body.id]);
    return { saved: body.saved };
  });
  app.post('/api/v1/profiles/:id/progress', async (request, reply) => {
    const { id: profileId } = profileParam.parse(request.params);
    if (!(await profileBelongsToDevice(profileId, deviceId(request)))) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Profile not found.' } });
    const body = progressInput.parse(request.body);
    await pool.query(`INSERT INTO watch_progress(profile_id,kind,catalog_id,position_seconds,duration_seconds,completed)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(profile_id,kind,catalog_id) DO UPDATE SET position_seconds=EXCLUDED.position_seconds,
      duration_seconds=EXCLUDED.duration_seconds,completed=EXCLUDED.completed,updated_at=now()`,
    [profileId, body.kind, body.id, body.positionSeconds, body.durationSeconds ?? null, body.completed]);
    return { saved: true };
  });
  app.post('/api/v1/playback/resolve', async (request, reply) => {
    const body = playbackInput.parse(request.body);
    const item = await getCatalog(body.kind, body.id);
    if (!item) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Stream not found.' } });
    const credentials = await loadProvider(options.credentialKey);
    if (!credentials) return reply.code(503).send({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'Provider is not configured.' } });
    if (body.kind === 'live' && body.format && credentials.allowedLiveFormats?.length && !credentials.allowedLiveFormats.includes(body.format)) {
      return reply.code(422).send({ error: { code: 'FORMAT_UNAVAILABLE', message: 'The provider does not support this live format.' } });
    }
    const url = playbackUrl(credentials, item, body.format);
    return { url, format: body.format ?? item.streamExtension ?? 'm3u8' };
  });
  return app;
}
