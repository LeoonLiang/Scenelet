const crypto = require('node:crypto');
const path = require('node:path');
const { t } = require('./i18n.cjs');

const defaults = { language: 'system', interval: 60, rotation: false, order: 'shuffle', rotationSource: 'favorites', fit: 'fill', autostart: false, minimizeToTray: true, quality: '2560', cacheLimit: 1024, orientation: 'landscape', minWidth: 0, onlineSource: { kind: 'author', value: '', name: '' } };
function normalizeSettings(input = {}) {
  return {
    language: ['zh', 'en'].includes(input.language) ? input.language : 'system',
    interval: Number.isInteger(Number(input.interval)) && Number(input.interval) >= 1 && Number(input.interval) <= 10080 ? Number(input.interval) : defaults.interval,
    rotation: input.rotation === true,
    order: input.rotationSource !== 'online' && input.order === 'sequential' ? 'sequential' : 'shuffle',
    rotationSource: ['library', 'online'].includes(input.rotationSource) || /^playlist:[a-zA-Z0-9-]+$/.test(input.rotationSource) ? input.rotationSource : 'favorites',
    onlineSource: normalizeOnlineSource(input.onlineSource, true),
    fit: ['fill', 'fit', 'stretch', 'center'].includes(input.fit) ? input.fit : 'fill',
    autostart: input.autostart === true,
    minimizeToTray: input.minimizeToTray !== false,
    quality: ['1920', '2560', '3840'].includes(input.quality) ? input.quality : '2560',
    cacheLimit: [256, 512, 1024, 2048].includes(Number(input.cacheLimit)) ? Number(input.cacheLimit) : 1024,
    orientation: ['all', 'landscape', 'portrait', 'squarish'].includes(input.orientation) ? input.orientation : 'landscape',
    minWidth: [0, 1920, 2560, 3840].includes(Number(input.minWidth)) ? Number(input.minWidth) : 0,
  };
}
function nextPhoto(photos, currentId, order, random = Math.random) {
  if (!photos.length) throw new Error(t('core.emptyPool'));
  if (photos.length === 1) return photos[0];
  if (order === 'sequential') return photos[(photos.findIndex(p => p.id === currentId) + 1) % photos.length];
  const candidates = photos.filter(p => p.id !== currentId);
  return candidates[Math.floor(random() * candidates.length)];
}
function imageUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'images.unsplash.com') throw new Error(t('core.imageUrl'));
  return url;
}
function apiUrl(value) {
  const url = new URL(value, 'https://api.unsplash.com');
  if (url.protocol !== 'https:' || url.hostname !== 'api.unsplash.com') throw new Error(t('core.apiUrl'));
  return url;
}
function buildQuery(input = {}) {
  const kind = input.kind || 'discover';
  const value = String(input.value || '').trim();
  const page = Math.max(1, Math.min(1000, Math.floor(Number(input.page) || 1)));
  let endpoint = '/photos';
  if (kind === 'search' && value) endpoint = '/search/photos';
  else if (kind === 'author') {
    if (!/^[a-zA-Z0-9_-]{1,60}$/.test(value)) throw new Error(t('core.username'));
    endpoint = `/users/${encodeURIComponent(value)}/photos`;
  } else if (kind === 'collection' || kind === 'topic') {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error(t('core.collectionId'));
    endpoint = `/${kind === 'collection' ? 'collections' : 'topics'}/${encodeURIComponent(value)}/photos`;
  } else if (!['discover', 'search'].includes(kind)) throw new Error(t('core.kind'));
  const url = apiUrl(endpoint);
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', '24');
  url.searchParams.set('order_by', input.sort === 'popular' ? 'popular' : 'latest');
  if (['landscape', 'portrait', 'squarish'].includes(input.orientation)) url.searchParams.set('orientation', input.orientation);
  if (endpoint === '/search/photos') {
    url.searchParams.set('query', value);
    if (input.sort === 'popular') url.searchParams.set('order_by', 'relevant');
  }
  return url;
}
function normalizeOnlineSource(input = {}, allowEmpty = false) {
  const kind = ['author', 'collection', 'topic', 'search', 'discover'].includes(input?.kind) ? input.kind : 'author';
  let value = String(input?.value || '').trim();
  if (value.includes('://')) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'unsplash.com') throw new Error(t('core.linkHost'));
    const parts = url.pathname.split('/').filter(Boolean);
    if (kind === 'author' && parts[0]?.startsWith('@')) value = parts[0].slice(1);
    else if (kind === 'collection' && parts[0] === 'collections') value = parts[1] || '';
    else if (kind === 'topic' && ['t', 'topics'].includes(parts[0])) value = parts[1] || '';
    else throw new Error(t('core.linkMismatch'));
  } else if (kind === 'author') value = value.replace(/^@/, '');
  if (kind === 'discover') value = '';
  else if (!value && !allowEmpty) throw new Error(t('core.sourceEmpty'));
  else if (value && (kind === 'search' ? value.length > 120 : !new RegExp(`^[a-zA-Z0-9_-]{1,${kind === 'author' ? 60 : 100}}$`).test(value))) throw new Error(t('core.sourceFormat'));
  return { kind, value, name: String(input?.name || '').trim().slice(0, 100) || value || (kind === 'discover' ? t('source.discover') : '') };
}
function buildRandomQuery(source, settings = {}) {
  const s = normalizeOnlineSource(source);
  const url = apiUrl('/photos/random');
  url.searchParams.set('count', '12');
  if (s.kind === 'author') url.searchParams.set('username', s.value);
  if (s.kind === 'collection') url.searchParams.set('collections', s.value);
  if (s.kind === 'topic') url.searchParams.set('topics', s.value);
  if (s.kind === 'search') url.searchParams.set('query', s.value);
  if (['landscape', 'portrait', 'squarish'].includes(settings.orientation)) url.searchParams.set('orientation', settings.orientation);
  return url;
}
async function fetchRandomMatching(source, settings, fetchAPI, currentId, recentIds = [], random = Math.random) {
  const s = normalizeOnlineSource(source);
  const url = buildRandomQuery(s, settings);
  const recent = new Set(recentIds.slice(0, 20));
  const fallback = new Map();
  let remaining;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await fetchAPI(url);
    remaining = result.remaining;
    const raw = Array.isArray(result.data) ? result.data : [result.data];
    const unique = new Map(raw.filter(p => s.kind !== 'author' || p.user?.username?.toLowerCase() === s.value.toLowerCase()).map(publicPhoto).filter(p => p.id !== currentId && matchesPhoto(p, settings)).map(p => [p.id, p]));
    unique.forEach(p => fallback.set(p.id, p));
    const fresh = [...unique.values()].filter(p => !recent.has(p.id));
    if (fresh.length) return { photo: fresh[Math.floor(random() * fresh.length)], remaining, attempts: attempt + 1 };
  }
  const candidates = [...fallback.values()];
  if (candidates.length) return { photo: candidates[Math.floor(random() * candidates.length)], remaining, attempts: 3 };
  throw new Error(t('core.noMatch'));
}
function publicPhoto(p) {
  return { id: p.id, source: 'unsplash', title: p.description || p.alt_description || 'Untitled', width: p.width, height: p.height, color: p.color, thumb: p.urls.small, full: p.urls.regular, raw: p.urls.raw, author: p.user.name, username: p.user.username, authorUrl: p.user.links.html, link: p.links.html, downloadLocation: p.links.download_location, createdAt: p.created_at };
}
function matchesPhoto(p, input = {}) {
  const ratio = p.width / p.height;
  if (input.orientation === 'landscape' && ratio <= 1.1) return false;
  if (input.orientation === 'portrait' && ratio >= 0.9) return false;
  if (input.orientation === 'squarish' && (ratio < 0.9 || ratio > 1.1)) return false;
  if (Number(input.minWidth) > p.width) return false;
  return true;
}
async function fetchMatching(input, fetchPage) {
  let page = Math.max(1, Math.floor(Number(input.page) || 1));
  let remaining, hasMore = true, photos = [];
  for (let scan = 0; scan < 3; scan++) {
    const result = await fetchPage(buildQuery({ ...input, page }));
    remaining = result.remaining;
    const data = result.data;
    const list = Array.isArray(data) ? data : data.results;
    photos.push(...list.map(publicPhoto).filter(p => matchesPhoto(p, input)));
    hasMore = Array.isArray(data) ? list.length === 24 : page < data.total_pages;
    page++;
    if (photos.length >= 12 || !hasMore || input.kind === 'search') break;
  }
  return { photos, remaining, hasMore, nextPage: page };
}
function fileId(file) { return 'local-' + crypto.createHash('sha256').update(path.resolve(file)).digest('hex').slice(0, 24); }
module.exports = { defaults, normalizeSettings, nextPhoto, imageUrl, apiUrl, buildQuery, publicPhoto, fileId, matchesPhoto, fetchMatching, normalizeOnlineSource, buildRandomQuery, fetchRandomMatching };
