import './style.css';

type Kind = 'movie' | 'series' | 'live' | 'episode';
type Item = { kind: Kind; id: string; title: string; description?: string; posterUrl?: string; backdropUrl?: string;
  genre?: string; releaseYear?: number; durationSeconds?: number; rating?: number; positionSeconds?: number; seasonNumber?: number; episodeNumber?: number;
  metadata?: { language?: string; audio?: string; subtitles?: string } };
type Profile = { id: string; name: string };
type Home = { featured: Item | null; rows: Array<{ id: string; title: string; items: Item[] }> };
type Config = { url: string; token: string };
type View = 'home' | 'movies' | 'series' | 'live' | 'my-list' | 'search' | 'settings' | 'detail' | 'profiles';

const el = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const setup = el('central-setup');
const app = el('central-app');
const content = el('central-content');
const status = el('central-status');
const video = el<HTMLVideoElement>('central-video');
const player = el('central-player');
const playerStatus = el('central-player-status');
const profileButton = el<HTMLButtonElement>('central-profile');
let config: Config | null = null;
function deviceIdentifier(): string {
  const stored = localStorage.getItem('streamcinema.device');
  if (stored && /^[0-9a-f-]{36}$/i.test(stored)) return stored;
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes).map((value) => (`0${value.toString(16)}`).slice(-2)).join('');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  localStorage.setItem('streamcinema.device', id);
  return id;
}
const deviceId = deviceIdentifier();
let profile: Profile | null = null;
let profiles: Profile[] = [];
let view: View = 'home';
let previousView: View = 'home';
let lastFocus: HTMLElement | null = null;
let restoreCardKey = '';
let currentItem: Item | null = null;
let playingItem: Item | null = null;
let page = 1;
let loadedItems: Item[] = [];
let requestGeneration = 0;
let activeController: AbortController | null = null;
let lastProgressSave = 0;
let subtitlesIndex = -1;
let audioIndex = 0;
let activeLiveFormat: 'm3u8' | 'ts' = 'm3u8';
const watched = new Map<string, number>();
const favorites = new Set<string>();

function clear(node: HTMLElement): void { while (node.firstChild) node.removeChild(node.firstChild); }
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function setStatus(message: string): void { status.textContent = message; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Request failed.'; }
function safeUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter a valid server URL.');
  return url.origin + url.pathname.replace(/\/+$/, '');
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  if (!config) throw new Error('Connect to the catalog server first.');
  const url = `${config.url}/api/v1${path}`;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  activeController = controller;
  const timeout = window.setTimeout(() => controller?.abort(), 15_000);
  try {
    const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'X-Device-Id': deviceId, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: controller?.signal, cache: 'no-store' });
    if (response.status === 401) throw new Error('The TV access token was rejected.');
    if (!response.ok) throw new Error(`Server returned HTTP ${response.status}.`);
    return await response.json() as T;
  } finally { window.clearTimeout(timeout); if (activeController === controller) activeController = null; }
}
function cancelRequest(): void { activeController?.abort(); requestGeneration += 1; }
function navigate(next: View): void {
  cancelRequest();
  if (next !== 'detail' && next !== 'profiles') previousView = next;
  view = next;
  clear(content);
  document.querySelectorAll<HTMLButtonElement>('#central-sidebar [data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === next);
  });
  setStatus('');
  if (next === 'home') void showHome();
  else if (next === 'movies' || next === 'series' || next === 'live') void showList(next);
  else if (next === 'my-list') void showMyList();
  else if (next === 'search') showSearch();
  else if (next === 'settings') void showSettings();
  else if (next === 'profiles') showProfiles();
}
function card(item: Item): HTMLButtonElement {
  const button = node('button', 'central-card') as HTMLButtonElement;
  button.type = 'button';
  button.dataset.cardKey = `${item.kind}:${item.id}`;
  button.setAttribute('aria-label', `Open ${item.title}`);
  if (item.posterUrl) {
    const image = node('img'); image.src = item.posterUrl; image.alt = ''; image.loading = 'lazy';
    image.onerror = () => image.style.visibility = 'hidden'; button.appendChild(image);
  } else button.appendChild(node('div', 'central-placeholder'));
  button.appendChild(node('span', undefined, item.title));
  button.onclick = () => void openItem(item);
  return button;
}
function focusReturnedCard(root: HTMLElement): void {
  const preferred = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-card-key]')).find((button) => button.dataset.cardKey === restoreCardKey);
  (preferred ?? root.querySelector<HTMLButtonElement>('button'))?.focus();
  restoreCardKey = '';
}
function row(title: string, items: Item[]): HTMLElement {
  const section = node('section', 'central-row');
  section.appendChild(node('h2', undefined, title));
  const list = node('div', 'central-cards');
  items.slice(0, 20).forEach((item) => list.appendChild(card(item)));
  section.appendChild(list);
  return section;
}
async function showHome(): Promise<void> {
  const generation = requestGeneration;
  setStatus('Loading home…');
  try {
    const home = await api<Home>(`/home${profile ? `?profileId=${encodeURIComponent(profile.id)}` : ''}`);
    if (generation !== requestGeneration) return;
    clear(content);
    const continueRow = home.rows.find((group) => group.id === 'continue');
    continueRow?.items.forEach((item) => watched.set(`${item.kind}:${item.id}`, item.positionSeconds ?? 0));
    const myListRow = home.rows.find((group) => group.id === 'my-list');
    myListRow?.items.forEach((item) => favorites.add(`${item.kind}:${item.id}`));
    if (home.featured) {
      const hero = node('section', 'central-hero');
      if (home.featured.backdropUrl || home.featured.posterUrl) {
        const image = node('img'); image.src = home.featured.backdropUrl || home.featured.posterUrl || ''; image.alt = ''; hero.appendChild(image);
      }
      const copy = node('div', 'central-hero-copy'); copy.appendChild(node('h1', undefined, home.featured.title));
      copy.appendChild(node('p', undefined, home.featured.description || 'Featured from your catalog.'));
      const play = node('button', 'primary', 'View details') as HTMLButtonElement;
      play.onclick = () => void openItem(home.featured!); copy.appendChild(play); hero.appendChild(copy); content.appendChild(hero);
    }
    for (const group of home.rows) if (group.items.length) content.appendChild(row(group.title, group.items));
    setStatus('');
    focusReturnedCard(content);
  } catch (error) { if (generation === requestGeneration) setStatus(errorMessage(error)); }
}
async function showList(section: 'movies' | 'series' | 'live', append = false): Promise<void> {
  const generation = requestGeneration;
  if (!append) { page = 1; loadedItems = []; setStatus(`Loading ${section}…`); }
  try {
    const result = await api<{ items: Item[]; hasMore: boolean }>(`/${section}?page=${page}&limit=20`);
    if (generation !== requestGeneration) return;
    loadedItems = loadedItems.concat(result.items);
    clear(content);
    const heading = node('div', 'central-list-header'); heading.appendChild(node('h1', undefined, section === 'live' ? 'Live TV' : section[0].toUpperCase() + section.slice(1)));
    content.appendChild(heading);
    const grid = node('div', 'central-grid'); loadedItems.forEach((item) => grid.appendChild(card(item))); content.appendChild(grid);
    if (result.hasMore) {
      const more = node('button', 'central-more', 'Load more') as HTMLButtonElement;
      more.onclick = () => { page += 1; void showList(section, true); };
      content.appendChild(more);
    }
    setStatus(result.items.length ? '' : 'No items are available yet.');
    if (!append) focusReturnedCard(grid);
  } catch (error) { if (generation === requestGeneration) setStatus(errorMessage(error)); }
}
async function showMyList(): Promise<void> {
  if (!profile) return;
  try {
    const result = await api<{ items: Item[] }>(`/profiles/${profile.id}/my-list`);
    if (view !== 'my-list') return;
    clear(content); content.appendChild(node('h1', undefined, 'My List'));
    const grid = node('div', 'central-grid'); result.items.forEach((item) => grid.appendChild(card(item))); content.appendChild(grid);
    focusReturnedCard(grid);
    if (!result.items.length) setStatus('Your list is empty.');
  } catch (error) { setStatus(errorMessage(error)); }
}
function showSearch(): void {
  const heading = node('h1', undefined, 'Search'); content.appendChild(heading);
  const input = node('input', 'central-search') as HTMLInputElement; input.type = 'search'; input.placeholder = 'Movies and series';
  content.appendChild(input);
  const results = node('div', 'central-grid'); content.appendChild(results);
  let timer = 0;
  input.oninput = () => {
    window.clearTimeout(timer); const query = input.value.trim(); clear(results);
    if (query.length < 2) return;
    timer = window.setTimeout(() => { void (async () => {
      try {
        const data = await api<{ movies: Item[]; series: Item[] }>(`/search?q=${encodeURIComponent(query)}&limit=20`);
        if (input.value.trim() !== query || view !== 'search') return;
        data.movies.concat(data.series).forEach((item) => results.appendChild(card(item)));
        setStatus(results.children.length ? '' : 'No results.');
      } catch (error) { setStatus(errorMessage(error)); }
    })(); }, 250);
  };
  input.focus();
}
async function openItem(item: Item): Promise<void> {
  if (item.kind === 'live' || item.kind === 'episode') { await play(item); return; }
  lastFocus = document.activeElement as HTMLElement;
  restoreCardKey = `${item.kind}:${item.id}`;
  view = 'detail'; clear(content); setStatus('Loading details…');
  try {
    const detail = await api<Item>(`/${item.kind === 'movie' ? 'movies' : 'series'}/${item.id}`);
    if (view !== 'detail') return;
    currentItem = detail;
    clear(content); setStatus('');
    const back = node('button', 'central-more', '← Back') as HTMLButtonElement;
    back.onclick = () => backFromDetail(); content.appendChild(back);
    const layout = node('section', 'central-detail');
    if (detail.posterUrl) { const image = node('img'); image.src = detail.posterUrl; image.alt = ''; layout.appendChild(image); }
    const body = node('div'); body.appendChild(node('h1', undefined, detail.title));
    const meta = [detail.releaseYear, detail.genre, detail.durationSeconds ? `${Math.round(detail.durationSeconds / 60)} min` : ''].filter(Boolean).join(' · ');
    body.appendChild(node('p', undefined, meta)); body.appendChild(node('p', undefined, detail.description || ''));
    body.appendChild(node('p', undefined, detail.metadata?.language ? `Listed language: ${detail.metadata.language}` : 'Audio and subtitle availability is detected when playback starts.'));
    if (detail.kind === 'movie') {
      const playButton = node('button', 'primary', watched.has(`movie:${detail.id}`) ? 'Resume' : 'Play') as HTMLButtonElement;
      playButton.onclick = () => void play(detail); body.appendChild(playButton);
    }
    let saved = favorites.has(`${detail.kind}:${detail.id}`);
    const favorite = node('button', undefined, saved ? 'Remove from My List' : 'Add to My List') as HTMLButtonElement;
    favorite.onclick = () => void (async () => {
      if (!profile) return;
      saved = !saved;
      try { await api(`/profiles/${profile.id}/my-list`, { kind: detail.kind, id: detail.id, saved });
        if (saved) favorites.add(`${detail.kind}:${detail.id}`); else favorites.delete(`${detail.kind}:${detail.id}`);
        favorite.textContent = saved ? 'Remove from My List' : 'Add to My List'; }
      catch (error) { saved = !saved; setStatus(errorMessage(error)); }
    })();
    body.appendChild(favorite); layout.appendChild(body); content.appendChild(layout);
    if (detail.kind === 'series') await showEpisodes(detail.id);
    back.focus();
  } catch (error) { setStatus(errorMessage(error)); }
}
async function showEpisodes(seriesId: string): Promise<void> {
  try {
    const data = await api<{ seasons: Array<{ number: number; count: number }> }>(`/series/${seriesId}/seasons`);
    if (view !== 'detail' || currentItem?.id !== seriesId) return;
    const picker = node('div', 'central-season-picker');
    const episodes = node('section', 'central-row');
    for (const season of data.seasons) {
      const button = node('button', 'central-more', `Season ${season.number} (${season.count})`) as HTMLButtonElement;
      button.onclick = () => { clear(episodes); void loadEpisodePage(seriesId, season.number, 1, episodes); };
      picker.appendChild(button);
    }
    content.appendChild(picker); content.appendChild(episodes);
    if (data.seasons.length) await loadEpisodePage(seriesId, data.seasons[0].number, 1, episodes);
    if (!data.seasons.length) content.appendChild(node('p', undefined, 'Episodes are still syncing. Please check again shortly.'));
  } catch (error) { setStatus(errorMessage(error)); }
}
async function loadEpisodePage(seriesId: string, season: number, episodePage: number, target: HTMLElement): Promise<void> {
  try {
    const result = await api<{ items: Item[]; hasMore: boolean }>(`/series/${seriesId}/seasons/${season}/episodes?page=${episodePage}&limit=20`);
    if (view !== 'detail' || currentItem?.id !== seriesId) return;
    if (episodePage === 1) { clear(target); target.appendChild(node('h2', undefined, `Season ${season}`)); }
    for (const episode of result.items) {
      const button = node('button', 'central-episode', `${episode.episodeNumber ?? ''}. ${episode.title}`) as HTMLButtonElement;
      if (episode.description) button.appendChild(node('small', undefined, episode.description));
      button.onclick = () => void play({ ...episode, kind: 'episode' }); target.appendChild(button);
    }
    if (result.hasMore) {
      const more = node('button', 'central-more', 'More episodes') as HTMLButtonElement;
      more.onclick = () => { more.remove(); void loadEpisodePage(seriesId, season, episodePage + 1, target); };
      target.appendChild(more);
    }
  } catch (error) { setStatus(errorMessage(error)); }
}
function backFromDetail(): void { navigate(previousView); }
async function play(item: Item, liveFormat: 'm3u8' | 'ts' = 'm3u8'): Promise<void> {
  try {
    playerStatus.textContent = 'Resolving stream…';
    const resolved = await api<{ url: string }>(`/playback/resolve`, { kind: item.kind, id: item.id, format: item.kind === 'live' ? liveFormat : undefined });
    const stream = new URL(resolved.url);
    if (!['http:', 'https:'].includes(stream.protocol)) throw new Error('Unsupported stream URL.');
    playingItem = item; lastProgressSave = 0; activeLiveFormat = liveFormat;
    el('central-playing-title').textContent = item.title;
    player.classList.remove('hidden');
    video.src = resolved.url;
    video.load();
    video.onloadedmetadata = null;
    const position = watched.get(`${item.kind}:${item.id}`) ?? item.positionSeconds ?? 0;
    if (position > 0) video.onloadedmetadata = () => { try { video.currentTime = position; } catch { /* Live streams may not seek. */ } };
    await video.play();
    playerStatus.textContent = '';
    el<HTMLButtonElement>('central-play-pause').focus();
  } catch (error) {
    if (item.kind === 'live' && liveFormat === 'm3u8' && errorMessage(error).includes('HTTP 422')) { await play(item, 'ts'); return; }
    playerStatus.textContent = errorMessage(error); setStatus(errorMessage(error));
  }
}
async function saveProgress(completed = false): Promise<void> {
  if (!profile || !playingItem) return;
  const positionSeconds = Number.isFinite(video.currentTime) ? Math.max(0, Math.floor(video.currentTime)) : 0;
  const durationSeconds = Number.isFinite(video.duration) ? Math.floor(video.duration) : undefined;
  watched.set(`${playingItem.kind}:${playingItem.id}`, positionSeconds);
  try { await api(`/profiles/${profile.id}/progress`, { kind: playingItem.kind, id: playingItem.id, positionSeconds, durationSeconds, completed }); }
  catch { /* Playback continues if progress cannot be saved. */ }
}
function closePlayer(save = true): void {
  if (player.classList.contains('hidden')) return;
  if (save) void saveProgress(); video.pause(); video.removeAttribute('src'); video.load(); player.classList.add('hidden');
  playingItem = null; lastFocus?.focus();
}
function showProfiles(): void {
  content.appendChild(node('h1', undefined, 'Choose a profile'));
  for (const choice of profiles) {
    const button = node('button', 'central-more', choice.name) as HTMLButtonElement;
    button.onclick = () => { profile = choice; watched.clear(); favorites.clear(); localStorage.setItem('streamcinema.profile', choice.id); profileButton.textContent = choice.name; navigate('home'); };
    content.appendChild(button);
  }
  const input = node('input', 'central-search') as HTMLInputElement; input.placeholder = 'New profile name'; input.maxLength = 24;
  content.appendChild(input);
  const add = node('button', 'central-more', 'Create profile') as HTMLButtonElement;
  add.onclick = () => void (async () => {
    try { const next = await api<Profile>('/profiles', { name: input.value.trim() }); profiles.push(next); profile = next; localStorage.setItem('streamcinema.profile', next.id); profileButton.textContent = next.name; navigate('home'); }
    catch (error) { setStatus(errorMessage(error)); }
  })(); content.appendChild(add);
}
async function showSettings(): Promise<void> {
  const panel = node('section', 'central-settings'); panel.appendChild(node('h1', undefined, 'Settings'));
  panel.appendChild(node('p', undefined, `Server: ${config?.url ?? ''}`));
  const sync = node('p', undefined, 'Loading sync status…'); panel.appendChild(sync);
  const reconnect = node('button', undefined, 'Change server') as HTMLButtonElement;
  reconnect.onclick = () => { localStorage.removeItem('streamcinema.config'); location.reload(); };
  panel.appendChild(reconnect); content.appendChild(panel);
  try {
    const data = await api<{ datasets: Array<{ dataset: string; status: string; lastSuccessAt?: string }> }>('/sync/status');
    sync.textContent = data.datasets.map((entry) => `${entry.dataset}: ${entry.status}${entry.lastSuccessAt ? ` · ${new Date(entry.lastSuccessAt).toLocaleString()}` : ''}`).join('  |  ') || 'Catalog has not synchronized yet.';
  } catch (error) { sync.textContent = errorMessage(error); }
}
async function connect(next: Config): Promise<void> {
  config = next;
  await api('/health');
  const result = await api<{ items: Profile[] }>('/profiles');
  profiles = result.items;
  if (!profiles.length) { const first = await api<Profile>('/profiles', { name: 'Default' }); profiles = [first]; }
  profile = profiles.find((entry) => entry.id === localStorage.getItem('streamcinema.profile')) ?? profiles[0];
  localStorage.setItem('streamcinema.profile', profile.id);
  profileButton.textContent = profile.name;
  localStorage.setItem('streamcinema.config', JSON.stringify(next));
  setup.classList.add('hidden'); app.classList.remove('hidden'); navigate('home');
}

el<HTMLFormElement>('central-form').onsubmit = (event) => {
  event.preventDefault();
  const input = { url: el<HTMLInputElement>('central-url').value, token: el<HTMLInputElement>('central-token').value.trim() };
  void (async () => {
    try { await connect({ url: safeUrl(input.url), token: input.token }); }
    catch (error) { el('central-setup-error').textContent = errorMessage(error); }
  })();
};
document.querySelectorAll<HTMLButtonElement>('#central-sidebar [data-view]').forEach((button) => {
  button.onclick = () => navigate(button.dataset.view as View);
});
profileButton.onclick = () => navigate('profiles');
el<HTMLButtonElement>('central-player-back').onclick = () => closePlayer();
el<HTMLButtonElement>('central-play-pause').onclick = () => { if (video.paused) void video.play(); else video.pause(); };
el<HTMLButtonElement>('central-rewind').onclick = () => { if (video.seekable.length) video.currentTime = Math.max(0, video.currentTime - 10); };
el<HTMLButtonElement>('central-forward').onclick = () => { if (video.seekable.length) video.currentTime += 10; };
el<HTMLButtonElement>('central-subtitle').onclick = () => {
  const tracks = video.textTracks;
  if (!tracks.length) { playerStatus.textContent = 'No subtitles available for this stream.'; return; }
  subtitlesIndex = (subtitlesIndex + 1) % (tracks.length + 1);
  for (let index = 0; index < tracks.length; index++) tracks[index].mode = index === subtitlesIndex ? 'showing' : 'disabled';
  playerStatus.textContent = subtitlesIndex === tracks.length ? 'Subtitles off' : `Subtitles: ${tracks[subtitlesIndex].label || tracks[subtitlesIndex].language || subtitlesIndex + 1}`;
};
el<HTMLButtonElement>('central-audio').onclick = () => {
  const tracks = (video as HTMLVideoElement & { audioTracks?: { length: number; [index: number]: { enabled: boolean; label?: string; language?: string } } }).audioTracks;
  if (!tracks?.length) { playerStatus.textContent = 'Audio track selection is unavailable for this stream.'; return; }
  audioIndex = (audioIndex + 1) % tracks.length;
  for (let index = 0; index < tracks.length; index++) tracks[index].enabled = index === audioIndex;
  playerStatus.textContent = `Audio: ${tracks[audioIndex].label || tracks[audioIndex].language || audioIndex + 1}`;
};
video.ontimeupdate = () => {
  if (Date.now() - lastProgressSave >= 15_000 && playingItem) { lastProgressSave = Date.now(); void saveProgress(); }
};
video.onended = () => { void saveProgress(true); closePlayer(false); };
video.onerror = () => {
  if (playingItem?.kind === 'live' && activeLiveFormat === 'm3u8') { const item = playingItem; playingItem = null; void play(item, 'ts'); return; }
  if (playingItem) playerStatus.textContent = 'This stream could not play. Check TV codec and stream format support.';
};
video.onpause = () => { el('central-play-pause').textContent = 'Play'; };
video.onplay = () => { el('central-play-pause').textContent = 'Pause'; };

document.addEventListener('keydown', (event) => {
  const active = document.activeElement as HTMLElement | null;
  const key = event.keyCode;
  const isBack = [461, 10009, 8, 27].includes(key) || ['Escape', 'BrowserBack'].includes(event.key);
  if ((active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') && key === 8) return;
  if ((active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') && !isBack) return;
  if (isBack) {
    event.preventDefault();
    if (!player.classList.contains('hidden')) closePlayer();
    else if (view === 'detail') backFromDetail();
    else if (view !== 'home') navigate('home');
    return;
  }
  if (key === 23 && active?.tagName === 'BUTTON') { event.preventDefault(); active.click(); return; }
  const playerOpen = !player.classList.contains('hidden');
  if (playerOpen) {
    if (key === 415 || key === 19) { event.preventDefault(); if (video.paused) void video.play(); else video.pause(); }
    if (key === 412 && video.seekable.length) { event.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 10); }
    if (key === 417 && video.seekable.length) { event.preventDefault(); video.currentTime += 10; }
    if (![37, 38, 39, 40].includes(key)) return;
  }
  if (![37, 38, 39, 40].includes(key)) return;
  const current = active?.getBoundingClientRect();
  if (!current) return;
  const scope = playerOpen ? '#central-player' : '#central-app';
  const buttons = Array.from(document.querySelectorAll<HTMLElement>(`${scope} button:not([disabled])`)).filter((button) => button.offsetParent !== null && button !== active);
  const cx = current.left + current.width / 2, cy = current.top + current.height / 2;
  let best: HTMLElement | null = null, score = Infinity;
  for (const button of buttons) {
    const rect = button.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const dx = x - cx, dy = y - cy;
    if ((key === 37 && dx >= -5) || (key === 39 && dx <= 5) || (key === 38 && dy >= -5) || (key === 40 && dy <= 5)) continue;
    const distance = (key === 37 || key === 39) ? Math.abs(dx) + Math.abs(dy) * 3 : Math.abs(dy) + Math.abs(dx) * 3;
    if (distance < score) { score = distance; best = button; }
  }
  if (best) { event.preventDefault(); best.focus(); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
});

try {
  const saved = JSON.parse(localStorage.getItem('streamcinema.config') || 'null') as Config | null;
  if (saved?.url && saved.token) void connect(saved).catch((error) => {
    setup.classList.remove('hidden'); el('central-setup-error').textContent = errorMessage(error);
    el<HTMLInputElement>('central-url').value = saved.url;
  });
  else setup.classList.remove('hidden');
} catch { setup.classList.remove('hidden'); }
