import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { decrypt, encrypt, tokenMatches } from '../src/security.js';
import { mapCatalogItem, mapEpisodes, playbackUrl } from '../src/provider.js';
import { makeApi } from '../src/api.js';

test('provider credentials encrypt with randomized authenticated ciphertext', () => {
  const key = randomBytes(32);
  const first = encrypt('secret-value', key);
  const second = encrypt('secret-value', key);
  assert.notEqual(first, second);
  assert.equal(decrypt(first, key), 'secret-value');
  assert.throws(() => decrypt(first, randomBytes(32)));
});

test('bearer token comparison rejects malformed and different tokens', () => {
  const token = 'a'.repeat(40);
  assert.equal(tokenMatches(`Bearer ${token}`, token), true);
  assert.equal(tokenMatches(`Bearer ${'b'.repeat(40)}`, token), false);
  assert.equal(tokenMatches(token, token), false);
});

test('Xtream records and episodes map to separate catalog items', () => {
  const movie = mapCatalogItem('movie', { stream_id: 55, name: 'Film', category_id: 7, container_extension: 'mkv', added: '1700000000' });
  assert.equal(movie?.id, '55');
  assert.equal(movie?.streamExtension, 'mkv');
  const episodes = mapEpisodes('99', { episodes: { '2': [{ id: '123', title: 'Chapter', episode_num: 4, container_extension: 'mp4' }] } });
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].parentId, '99');
  assert.equal(episodes[0].seasonNumber, 2);
  assert.equal(episodes[0].episodeNumber, 4);
});

test('playback resolver builds the provider path and rejects a series without episode', () => {
  const credentials = { baseUrl: 'http://provider.example:8080/', username: 'u name', password: 'p/word' };
  const movie = playbackUrl(credentials, { kind: 'movie', id: '55', streamExtension: 'mp4' });
  assert.match(movie, /\/movie\/u%20name\/p%2Fword\/55\.mp4$/);
  assert.throws(() => playbackUrl(credentials, { kind: 'series', id: '99' }));
});

test('catalog API requires bearer authentication and validates requests before database access', async () => {
  const token = 't'.repeat(40);
  const app = makeApi({ apiToken: token, credentialKey: randomBytes(32) });
  try {
    const unauthorized = await app.inject({ method: 'GET', url: '/api/v1/movies' });
    assert.equal(unauthorized.statusCode, 401);
    const invalid = await app.inject({ method: 'GET', url: '/api/v1/movies?page=0', headers: { authorization: `Bearer ${token}`, 'x-device-id': '00000000-0000-4000-8000-000000000001' } });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().error.code, 'INVALID_INPUT');
  } finally { await app.close(); }
});
