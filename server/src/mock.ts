import { pool, upsertRecords } from './database.js';
import type { CatalogRecord } from './provider.js';

/** Small synthetic catalog for database/API development. No provider or media is used. */
export async function seedMockCatalog(): Promise<void> {
  const data: CatalogRecord[] = [
    { kind: 'movie', id: '900001', title: 'The Quiet Signal', description: 'A fictional catalog entry for interface testing.', categoryId: '900', genre: 'Drama', releaseYear: 2024, rating: 7.5 },
    { kind: 'movie', id: '900002', title: 'Northern Light', description: 'A second fictional movie.', categoryId: '900', genre: 'Drama', releaseYear: 2023, rating: 7.1 },
    { kind: 'series', id: '900003', title: 'The Long Route', description: 'A fictional series with one episode.', categoryId: '901', genre: 'Adventure', releaseYear: 2025, rating: 8.0 },
    { kind: 'episode', id: '900004', parentId: '900003', seasonNumber: 1, episodeNumber: 1, title: 'First Stop', description: 'A fictional episode.', streamExtension: 'mp4' },
    { kind: 'live', id: '900005', title: 'Sample Channel', categoryId: '902' }
  ];
  await upsertRecords(data);
  for (const [kind, id, name] of [['movie', '900', 'Drama'], ['series', '901', 'Adventure'], ['live', '902', 'Sample']] as const) {
    await pool.query(`INSERT INTO categories(kind,id,name) VALUES($1,$2,$3) ON CONFLICT(kind,id) DO UPDATE SET name=EXCLUDED.name,active=true`, [kind, id, name]);
  }
  for (const dataset of ['movie', 'series', 'live', 'episodes']) {
    await pool.query(`INSERT INTO sync_state(dataset,status,last_attempt_at,last_success_at,row_count)
      VALUES($1,'success',now(),now(),1) ON CONFLICT(dataset) DO UPDATE SET status='success',last_attempt_at=now(),last_success_at=now()`, [dataset]);
  }
}
