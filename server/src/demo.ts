import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

type Item = { kind: 'movie' | 'series' | 'live' | 'episode'; id: string; title: string; description: string;
  genre?: string; releaseYear?: number; rating?: number; seasonNumber?: number; episodeNumber?: number;
  posterUrl?: string; backdropUrl?: string; positionSeconds?: number };
type Profile = { id: string; name: string; deviceId: string };
const movieTitles = ['The Quiet Signal', 'Northern Light', 'The Last Station', 'Deep Blue Hour', 'A City at Dawn',
  'Across the Valley', 'Before Tomorrow', 'Paper Skies', 'The Hidden Road', 'Winter Current', 'Parallel Days', 'Open Water',
  'Golden Echo', 'After the Rain', 'Silent Orbit', 'The Far Shore', 'Second Horizon', 'A Thousand Steps', 'Night Passage',
  'The Long Summer', 'The Seventh Door', 'Under the Pines', 'The Glass Bridge', 'Morning Tide'];
const seriesTitles = ['The Long Route', 'Beneath the Surface', 'Northbound', 'Small Worlds', 'The District', 'Memory Lane',
  'Beyond the Line', 'Wild Earth', 'The Archives', 'Harbor Lights', 'Last Call', 'Another Season'];
const channels = ['World News', 'Cinema One', 'Nature Live', 'City Sports', 'The Music Room', 'Travel Now'];
const movieGenres = ['Drama', 'Adventure', 'Mystery', 'Science Fiction'];
const colors = ['#b51d31', '#e65d2f', '#2d6f8e', '#6d469e', '#287f70', '#c18b29', '#555c88', '#8a4f55'];
const synopses: Record<string, string> = {
  'The Quiet Signal': 'When a vanished radio transmission returns after twenty years, a city engineer follows its trail into a mystery that could change everything she remembers.',
  'A City at Dawn': 'At sunrise, a stranger arrives in the city with one night to find the family she has never known.',
  'Across the Valley': 'Two old friends cross an unforgiving mountain range to keep a promise made long ago.',
  'Before Tomorrow': 'A late-night drive along the coast becomes a race against time when the past starts to catch up.'
};
const art = (id: string, wide = false) => `/demo-art/${id}${wide ? '?wide=1&v=2' : '?v=2'}`;
const movies: Item[] = movieTitles.map((title, index) => ({ kind: 'movie', id: String(1001 + index), title,
  description: synopses[title] || `An original fictional ${movieGenres[index % movieGenres.length].toLowerCase()} story from the local sample catalog.`,
  genre: movieGenres[index % movieGenres.length], releaseYear: 2025 - (index % 8), rating: 8.5 - (index % 6) * .3,
  posterUrl: art(String(1001 + index)), backdropUrl: art(String(1001 + index), true) }));
const series: Item[] = seriesTitles.map((title, index) => ({ kind: 'series', id: String(2001 + index), title,
  description: `A fictional episodic series created for the local StreamCinema demo.`, genre: movieGenres[index % movieGenres.length],
  releaseYear: 2024 - (index % 6), rating: 8.6 - (index % 5) * .3,
  posterUrl: art(String(2001 + index)), backdropUrl: art(String(2001 + index), true) }));
const live: Item[] = channels.map((title, index) => ({ kind: 'live', id: String(3001 + index), title,
  description: 'Fictional live channel for testing navigation.', posterUrl: art(String(3001 + index)), backdropUrl: art(String(3001 + index), true) }));
const episodes: Item[] = series.flatMap((show) => Array.from({ length: 7 }, (_, index) => ({ kind: 'episode' as const,
  id: String(Number(show.id) * 100 + index + 1), title: `Episode ${index + 1}: ${['Arrival', 'The Crossing', 'Signs', 'After Dark', 'The Choice', 'Turning Point', 'Homecoming'][index]}`,
  description: `Season 1 of ${show.title}. Fictional episode for local testing.`, seasonNumber: 1, episodeNumber: index + 1,
  posterUrl: art(show.id) })));
const all = movies.concat(series, live, episodes);
const profiles: Profile[] = [];
const favorites = new Set<string>();
const progress = new Map<string, { kind: string; id: string; positionSeconds: number; durationSeconds?: number; completed: boolean; updatedAt: number }>();
const profileKey = (profileId: string, kind: string, id: string) => `${profileId}:${kind}:${id}`;
const page = (items: Item[], query: Record<string, unknown>) => {
  const number = Math.max(1, Number(query.page) || 1), limit = Math.min(20, Math.max(1, Number(query.limit) || 20));
  const offset = (number - 1) * limit;
  return { items: items.slice(offset, offset + limit), page: number, limit, hasMore: items.length > offset + limit };
};
const xml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] || character);

export function createDemoServer() {
  const app = Fastify({ logger: false });
  const dist = fileURLToPath(new URL('../../client/dist/', import.meta.url));
  const file = (name: string) => readFile(fileURLToPath(new URL(name, `file:///${dist.replace(/\\/g, '/')}/`)));
  app.get('/', async (_request, reply) => reply.type('text/html; charset=utf-8').send(await file('index.html')));
  app.get('/assets/app.js', async (_request, reply) => reply.type('application/javascript; charset=utf-8').send(await file('assets/app.js')));
  app.get('/icon.png', async (_request, reply) => reply.type('image/png').send(await file('icon.png')));
  app.get('/demo-video', async (request, reply) => {
    const bytes = await readFile(new URL('../../demo-assets/flower.mp4', import.meta.url));
    const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
    reply.header('Accept-Ranges', 'bytes').type('video/mp4');
    if (!match) return reply.header('Content-Length', bytes.length).send(bytes);
    const start = Number(match[1]);
    const end = Math.min(bytes.length - 1, match[2] ? Number(match[2]) : bytes.length - 1);
    if (start >= bytes.length || end < start) return reply.code(416).header('Content-Range', `bytes */${bytes.length}`).send();
    return reply.code(206).header('Content-Range', `bytes ${start}-${end}/${bytes.length}`)
      .header('Content-Length', end - start + 1).send(bytes.subarray(start, end + 1));
  });
  app.get('/demo-art/:id', async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    const item = all.find((entry) => entry.id === id);
    if (!item) return reply.code(404).send();
    const wide = (request.query as { wide?: string }).wide === '1';
    const photo = ({ '1001': 'quiet-signal.png', '1005': 'city-at-dawn.png',
      '1006': 'across-valley.png', '1007': 'before-tomorrow.png' } as Record<string, string>)[id];
    if (photo && wide) return reply.type('image/png').header('Cache-Control', 'public,max-age=3600')
      .send(await readFile(new URL(`../../demo-assets/${photo}`, import.meta.url)));
    const width = wide ? 1000 : 350, height = wide ? 570 : 500;
    const color = colors[Number(id) % colors.length];
    const title = xml(item.title);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#101013"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${wide ? 740 : 240}" cy="130" r="180" fill="#ffffff" opacity=".10"/><circle cx="${wide ? 700 : 200}" cy="310" r="270" fill="#000000" opacity=".15"/><path d="M0 ${height * .58} Q${width * .5} ${height * .15} ${width} ${height * .75} V${height} H0Z" fill="#000000" opacity=".28"/><text x="${wide ? 60 : 25}" y="${height - 100}" fill="white" font-family="Arial,sans-serif" font-size="${wide ? 62 : 39}" font-weight="bold">${title}</text><text x="${wide ? 60 : 25}" y="${height - 48}" fill="#eeeeee" font-family="Arial,sans-serif" font-size="${wide ? 22 : 18}">STREAMCINEMA ORIGINAL DEMO</text></svg>`;
    return reply.type('image/svg+xml').header('Cache-Control', 'public,max-age=3600').send(svg);
  });
  app.get('/api/v1/health', async () => ({ status: 'ok', mode: 'local-demo' }));
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/v1/') || request.url === '/api/v1/health') return;
    if (request.headers.authorization !== 'Bearer local-demo-only' || typeof request.headers['x-device-id'] !== 'string') {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Local demo access required.' } });
    }
  });
  const device = (request: { headers: Record<string, unknown> }) => String(request.headers['x-device-id']);
  const ownedProfile = (request: { headers: Record<string, unknown> }, id: string) => profiles.find((entry) => entry.id === id && entry.deviceId === device(request));
  app.get('/api/v1/profiles', async (request) => ({ items: profiles.filter((entry) => entry.deviceId === device(request)).map(({ id, name }) => ({ id, name })) }));
  app.post('/api/v1/profiles', async (request, reply) => {
    const name = String((request.body as { name?: string })?.name || '').trim().slice(0, 24);
    if (!name) return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'Enter a profile name.' } });
    const profile = { id: randomUUID(), name, deviceId: device(request) }; profiles.push(profile);
    return reply.code(201).send({ id: profile.id, name });
  });
  app.get('/api/v1/home', async (request) => {
    const profileId = String((request.query as { profileId?: string }).profileId || '');
    const history = Array.from(progress.entries()).filter(([key, value]) => key.startsWith(`${profileId}:`) && !value.completed)
      .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
      .map(([, value]) => ({ ...all.find((entry) => entry.id === value.id && entry.kind === value.kind)!, positionSeconds: value.positionSeconds })).filter((item) => item.id);
    const saved = Array.from(favorites).filter((key) => key.startsWith(`${profileId}:`)).map((key) => {
      const [kind, id] = key.slice(profileId.length + 1).split(':'); return all.find((entry) => entry.kind === kind && entry.id === id);
    }).filter((item): item is Item => !!item);
    return { featured: movies[0], rows: [
      { id: 'continue', title: 'Continue Watching', items: history.slice(0, 12) },
      { id: 'my-list', title: 'My List', items: saved.slice(0, 12) },
      { id: 'recommended-movies', title: 'Recommended Movies', items: movies.slice(4, 16) },
      { id: 'recommended-series', title: 'Recommended Series', items: series.slice(0, 12) },
      { id: 'recent-movies', title: 'Recently Added Movies', items: movies.slice(0, 12) },
      { id: 'recent-series', title: 'Recently Added Series', items: series.slice(0, 12) },
      { id: 'drama', title: 'Drama', items: movies.filter((item) => item.genre === 'Drama') },
      { id: 'adventure', title: 'Adventure', items: movies.filter((item) => item.genre === 'Adventure') }
    ] };
  });
  for (const [path, items] of [['movies', movies], ['series', series], ['live', live]] as const) {
    app.get(`/api/v1/${path}`, async (request) => page(items, request.query as Record<string, unknown>));
  }
  for (const [path, items] of [['movies', movies], ['series', series]] as const) {
    app.get(`/api/v1/${path}/:id`, async (request, reply) => items.find((item) => item.id === (request.params as { id: string }).id)
      ?? reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Title not found.' } }));
  }
  app.get('/api/v1/series/:id/seasons', async (request) => ({ seasons: [{ number: 1, count: episodes.filter((item) => item.id.startsWith((request.params as { id: string }).id)).length }] }));
  app.get('/api/v1/series/:id/seasons/:season/episodes', async (request) => page(episodes.filter((item) => item.id.startsWith((request.params as { id: string }).id)), request.query as Record<string, unknown>));
  app.get('/api/v1/live/categories', async () => ({ items: [{ id: 'demo', name: 'Demo Channels' }] }));
  app.get('/api/v1/search', async (request) => {
    const q = String((request.query as { q?: string }).q || '').toLowerCase();
    return { movies: movies.filter((item) => item.title.toLowerCase().includes(q)).slice(0, 10),
      series: series.filter((item) => item.title.toLowerCase().includes(q)).slice(0, 10), page: 1 };
  });
  app.get('/api/v1/profiles/:id/my-list', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!ownedProfile(request, id)) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Profile not found.' } });
    return { items: Array.from(favorites).filter((key) => key.startsWith(`${id}:`)).map((key) => {
      const [kind, itemId] = key.slice(id.length + 1).split(':'); return all.find((item) => item.kind === kind && item.id === itemId);
    }).filter(Boolean) };
  });
  app.post('/api/v1/profiles/:id/my-list', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!ownedProfile(request, id)) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Profile not found.' } });
    const body = request.body as { kind: string; id: string; saved: boolean };
    const key = profileKey(id, body.kind, body.id);
    if (body.saved) favorites.add(key); else favorites.delete(key);
    return { saved: body.saved };
  });
  app.get('/api/v1/profiles/:id/continue-watching', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!ownedProfile(request, id)) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Profile not found.' } });
    return { items: Array.from(progress.entries()).filter(([key, value]) => key.startsWith(`${id}:`) && !value.completed)
      .map(([, value]) => value).slice(0, 20) };
  });
  app.post('/api/v1/profiles/:id/progress', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!ownedProfile(request, id)) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Profile not found.' } });
    const body = request.body as { kind: string; id: string; positionSeconds: number; durationSeconds?: number; completed: boolean };
    progress.set(profileKey(id, body.kind, body.id), { ...body, updatedAt: Date.now() });
    return { saved: true };
  });
  app.post('/api/v1/playback/resolve', async () => ({ url: 'http://127.0.0.1:8080/demo-video', format: 'mp4' }));
  app.get('/api/v1/sync/status', async () => ({ datasets: [
    { dataset: 'movie', status: 'demo', rowCount: movies.length }, { dataset: 'series', status: 'demo', rowCount: series.length },
    { dataset: 'live', status: 'demo', rowCount: live.length }, { dataset: 'episodes', status: 'demo', rowCount: episodes.length }
  ] }));
  return app;
}
