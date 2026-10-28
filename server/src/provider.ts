export type ProviderCredentials = { baseUrl: string; username: string; password: string; playbackBaseUrl?: string; allowedLiveFormats?: string[] };
export type CatalogKind = 'live' | 'movie' | 'series' | 'episode';
export type CatalogRecord = {
  kind: CatalogKind; id: string; parentId?: string; seasonNumber?: number; episodeNumber?: number;
  categoryId?: string; title: string; description?: string; posterUrl?: string; backdropUrl?: string;
  genre?: string; releaseYear?: number; durationSeconds?: number; rating?: number; addedAt?: Date;
  streamExtension?: string; metadata?: Record<string, unknown>;
};

function string(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return String(value);
}
function number(value: unknown): number | undefined {
  const parsed = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(parsed) ? undefined : parsed;
}
function year(value: unknown): number | undefined {
  const match = string(value)?.match(/(?:19|20)\d{2}/);
  return match ? Number(match[0]) : undefined;
}
function duration(value: unknown): number | undefined {
  const raw = string(value);
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) return Number(raw) * 60;
  const parts = raw.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return undefined;
  return parts.reduce((sum, part) => sum * 60 + part, 0);
}
function timestamp(value: unknown): Date | undefined {
  const n = number(value);
  if (!n) return undefined;
  const date = new Date(n * 1000);
  return Number.isFinite(date.getTime()) ? date : undefined;
}
function safeExtension(value: unknown, fallback: string): string {
  const extension = string(value)?.toLowerCase() ?? fallback;
  return /^[a-z0-9]{2,5}$/.test(extension) ? extension : fallback;
}

export function mapCatalogItem(kind: 'live' | 'movie' | 'series', raw: Record<string, unknown>): CatalogRecord | null {
  const id = string(kind === 'series' ? raw.series_id : raw.stream_id);
  if (!id || !/^\d+$/.test(id)) return null;
  const info = typeof raw.info === 'object' && raw.info !== null ? raw.info as Record<string, unknown> : {};
  const title = string(raw.name)?.trim() || `Untitled ${id}`;
  return {
    kind, id, title, categoryId: string(raw.category_id),
    description: string(raw.plot ?? info.plot),
    posterUrl: string(kind === 'series' ? raw.cover : raw.stream_icon ?? info.movie_image),
    backdropUrl: string(Array.isArray(raw.backdrop_path) ? raw.backdrop_path[0] : raw.backdrop_path),
    genre: string(raw.genre ?? info.genre), releaseYear: year(raw.releaseDate ?? info.releasedate),
    durationSeconds: duration(info.duration), rating: number(raw.rating ?? info.rating),
    addedAt: timestamp(raw.added), streamExtension: kind === 'movie' ? safeExtension(raw.container_extension, 'mp4') : undefined,
    metadata: { language: string(info.language), director: string(info.director), youtubeTrailer: string(info.youtube_trailer) }
  };
}

export function mapEpisodes(seriesId: string, details: Record<string, unknown>): CatalogRecord[] {
  const groups = details.episodes && typeof details.episodes === 'object' ? details.episodes as Record<string, unknown> : {};
  const records: CatalogRecord[] = [];
  for (const [season, entries] of Object.entries(groups)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const raw = entry as Record<string, unknown>;
      const id = string(raw.id);
      if (!id || !/^\d+$/.test(id)) continue;
      const info = typeof raw.info === 'object' && raw.info !== null ? raw.info as Record<string, unknown> : {};
      records.push({ kind: 'episode', id, parentId: seriesId, seasonNumber: number(raw.season) ?? number(season) ?? 0,
        episodeNumber: number(raw.episode_num) ?? 0, title: string(raw.title) ?? `Episode ${raw.episode_num ?? id}`,
        description: string(info.plot), posterUrl: string(info.movie_image), releaseYear: year(info.releasedate),
        durationSeconds: duration(info.duration), streamExtension: safeExtension(raw.container_extension, 'mp4') });
    }
  }
  return records;
}

export function playbackUrl(credentials: ProviderCredentials, item: Pick<CatalogRecord, 'kind' | 'id' | 'streamExtension'>, liveFormat = 'm3u8'): string {
  if (!/^\d+$/.test(item.id)) throw new Error('Invalid stream identifier.');
  const format = item.kind === 'live' ? safeExtension(liveFormat, 'm3u8') : safeExtension(item.streamExtension, 'mp4');
  const path = item.kind === 'live' ? 'live' : item.kind === 'movie' ? 'movie' : item.kind === 'episode' ? 'series' : '';
  if (!path) throw new Error('A series needs an episode selection.');
  const base = new URL(credentials.playbackBaseUrl ?? credentials.baseUrl);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Invalid provider protocol.');
  const prefix = base.pathname.replace(/\/+$/, '');
  base.pathname = `${prefix}/${path}/${encodeURIComponent(credentials.username)}/${encodeURIComponent(credentials.password)}/${item.id}.${format}`;
  base.search = '';
  base.hash = '';
  return base.toString();
}

export async function requestProvider(credentials: ProviderCredentials, action: string, extra: Record<string, string> = {}): Promise<unknown> {
  const url = new URL('player_api.php', credentials.baseUrl.replace(/\/+$/, '') + '/');
  url.search = new URLSearchParams({ username: credentials.username, password: credentials.password, ...(action ? { action } : {}), ...extra }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { accept: 'application/json' }, redirect: 'error' });
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 100_000_000) throw new Error('Provider response exceeded size limit.');
  return JSON.parse(text) as unknown;
}

export function providerPlaybackInfo(credentials: ProviderCredentials, auth: unknown): { playbackBaseUrl?: string; allowedLiveFormats: string[] } {
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) return { allowedLiveFormats: [] };
  const root = auth as Record<string, unknown>;
  const user = root.user_info && typeof root.user_info === 'object' ? root.user_info as Record<string, unknown> : {};
  const server = root.server_info && typeof root.server_info === 'object' ? root.server_info as Record<string, unknown> : {};
  const allowedLiveFormats = Array.isArray(user.allowed_output_formats)
    ? user.allowed_output_formats.map((value) => String(value).toLowerCase()).filter((value) => value === 'ts' || value === 'm3u8') : [];
  try {
    const original = new URL(credentials.baseUrl);
    const host = String(server.url ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!host || /[/?#@]/.test(host)) return { allowedLiveFormats };
    const protocol = server.server_protocol === 'https' ? 'https:' : server.server_protocol === 'http' ? 'http:' : original.protocol;
    const playback = new URL(`${protocol}//${host}`);
    if (!playback.port && server.port) playback.port = String(server.port);
    return { playbackBaseUrl: playback.origin, allowedLiveFormats };
  } catch { return { allowedLiveFormats }; }
}
