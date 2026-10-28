import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { decrypt, encrypt } from './security.js';
import type { CatalogRecord, ProviderCredentials } from './provider.js';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 });

export async function migrate(): Promise<void> {
  const file = fileURLToPath(new URL('../database/001_init.sql', import.meta.url));
  await pool.query(await readFile(file, 'utf8'));
}

export async function saveProvider(credentials: ProviderCredentials, key: Buffer): Promise<void> {
  await pool.query(`INSERT INTO provider_config(id,base_url,username_cipher,password_cipher) VALUES('primary',$1,$2,$3)
    ON CONFLICT(id) DO UPDATE SET base_url=EXCLUDED.base_url,username_cipher=EXCLUDED.username_cipher,
    password_cipher=EXCLUDED.password_cipher,playback_base_url=NULL,allowed_live_formats='[]'::jsonb,updated_at=now()`,
    [credentials.baseUrl, encrypt(credentials.username, key), encrypt(credentials.password, key)]);
}

export async function loadProvider(key: Buffer): Promise<ProviderCredentials | null> {
  const { rows } = await pool.query<{ base_url: string; playback_base_url: string | null; allowed_live_formats: string[]; username_cipher: string; password_cipher: string }>(
    `SELECT base_url,playback_base_url,allowed_live_formats,username_cipher,password_cipher FROM provider_config WHERE id='primary'`);
  if (!rows[0]) return null;
  return { baseUrl: rows[0].base_url, playbackBaseUrl: rows[0].playback_base_url ?? undefined,
    allowedLiveFormats: rows[0].allowed_live_formats, username: decrypt(rows[0].username_cipher, key), password: decrypt(rows[0].password_cipher, key) };
}

export async function upsertRecords(records: CatalogRecord[], client?: pg.PoolClient): Promise<void> {
  if (!records.length) return;
  const data = records.map((record) => ({
    kind: record.kind, id: record.id, parent_id: record.parentId ?? null,
    season_number: record.seasonNumber ?? null, episode_number: record.episodeNumber ?? null,
    category_id: record.categoryId ?? null, title: record.title, description: record.description ?? null,
    poster_url: record.posterUrl ?? null, backdrop_url: record.backdropUrl ?? null,
    genre: record.genre ?? null, release_year: record.releaseYear ?? null,
    duration_seconds: record.durationSeconds ?? null, rating: record.rating ?? null,
    added_at: record.addedAt ?? null, stream_extension: record.streamExtension ?? null,
    metadata: record.metadata ?? {}
  }));
  await (client ?? pool).query(`INSERT INTO catalog(kind,id,parent_id,season_number,episode_number,category_id,title,description,poster_url,backdrop_url,
      genre,release_year,duration_seconds,rating,added_at,stream_extension,metadata,active,last_seen_at)
      SELECT kind,id,parent_id,season_number,episode_number,category_id,title,description,poster_url,backdrop_url,
        genre,release_year,duration_seconds,rating,added_at,stream_extension,metadata,true,now()
      FROM jsonb_to_recordset($1::jsonb) AS x(kind text,id text,parent_id text,season_number integer,episode_number integer,
        category_id text,title text,description text,poster_url text,backdrop_url text,genre text,release_year integer,
        duration_seconds integer,rating numeric,added_at timestamptz,stream_extension text,metadata jsonb)
      ON CONFLICT(kind,id) DO UPDATE SET parent_id=EXCLUDED.parent_id,season_number=EXCLUDED.season_number,
      episode_number=EXCLUDED.episode_number,category_id=EXCLUDED.category_id,title=EXCLUDED.title,
      description=EXCLUDED.description,poster_url=EXCLUDED.poster_url,backdrop_url=EXCLUDED.backdrop_url,
      genre=EXCLUDED.genre,release_year=EXCLUDED.release_year,duration_seconds=EXCLUDED.duration_seconds,
      rating=EXCLUDED.rating,added_at=EXCLUDED.added_at,stream_extension=EXCLUDED.stream_extension,
      metadata=EXCLUDED.metadata,active=true,last_seen_at=now()`, [JSON.stringify(data)]);
}

export async function listCatalog(kind: 'movie' | 'series' | 'live', page: number, limit: number, category?: string, query?: string) {
  const where = [`kind=$1`, `active=true`];
  const args: Array<string | number> = [kind];
  if (category) { args.push(category); where.push(`category_id=$${args.length}`); }
  if (query) { args.push(query); where.push(`to_tsvector('simple',title || ' ' || coalesce(description,'')) @@ plainto_tsquery('simple',$${args.length})`); }
  args.push(limit, (page - 1) * limit);
  const { rows } = await pool.query(`SELECT kind,id,parent_id AS "parentId",category_id AS "categoryId",title,description,
    poster_url AS "posterUrl",backdrop_url AS "backdropUrl",genre,release_year AS "releaseYear",
    duration_seconds AS "durationSeconds",rating,added_at AS "addedAt",stream_extension AS "streamExtension"
    FROM catalog WHERE ${where.join(' AND ')} ORDER BY added_at DESC NULLS LAST,id DESC LIMIT $${args.length - 1} OFFSET $${args.length}`, args);
  return rows;
}

export async function getCatalog(kind: string, id: string) {
  const { rows } = await pool.query(`SELECT kind,id,parent_id AS "parentId",season_number AS "seasonNumber",
    episode_number AS "episodeNumber",category_id AS "categoryId",title,description,poster_url AS "posterUrl",
    backdrop_url AS "backdropUrl",genre,release_year AS "releaseYear",duration_seconds AS "durationSeconds",
    rating,added_at AS "addedAt",stream_extension AS "streamExtension",metadata
    FROM catalog WHERE kind=$1 AND id=$2 AND active=true`, [kind, id]);
  return rows[0] ?? null;
}
