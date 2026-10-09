const core = require('./core.cjs');

function batchKey(settings) {
  const source = settings.rotationSource === 'online' ? core.normalizeOnlineSource(settings.onlineSource) : { kind: settings.rotationSource, value: '' };
  return JSON.stringify([source.kind, source.value, settings.orientation, settings.minWidth]);
}
function shuffled(photos, random = Math.random) {
  const result = [...photos];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
function preferUnseen(photos, recentIds, random = Math.random) {
  const recency = new Map(recentIds.map((id, index) => [id, index]));
  // Shuffle equal ranks; old photos return only after unseen candidates are exhausted.
  return shuffled(photos, random).sort((a, b) => (recency.get(b.id) ?? recentIds.length) - (recency.get(a.id) ?? recentIds.length));
}
async function fetchRandomBatch(source, settings, fetchAPI, recentIds = [], random = Math.random) {
  const normalized = core.normalizeOnlineSource(source);
  const url = core.buildRandomQuery(normalized, settings);
  url.searchParams.set('count', '30');
  const recent = new Set(recentIds), candidates = new Map();
  let remaining;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await fetchAPI(url);
    remaining = result.remaining;
    const raw = Array.isArray(result.data) ? result.data : [result.data];
    for (const item of raw) {
      if (normalized.kind === 'author' && item.user?.username?.toLowerCase() !== normalized.value.toLowerCase()) continue;
      const photo = core.publicPhoto(item);
      if (core.matchesPhoto(photo, settings)) candidates.set(photo.id, photo);
    }
    if ([...candidates.keys()].filter(id => !recent.has(id)).length >= 12) break;
  }
  if (!candidates.size) throw new Error(require('./i18n.cjs').t('core.noMatch'));
  return { photos: preferUnseen([...candidates.values()], recentIds, random).slice(0, 12), remaining };
}
function createPhotoBatch({ randomPhotos, localPhotos, publish = () => {} }) {
  let active, revision = 0;
  function entry(settings) {
    const key = batchKey(settings);
    if (active?.key !== key) active = { key, result: null, pending: null, recent: [] };
    return active;
  }
  async function get(settings, refresh = false) {
    const current = entry(settings);
    if (current.pending) return current.pending;
    if (current.result && !refresh && settings.rotationSource !== 'online') {
      const valid = new Map(localPhotos(settings).filter(p => !p.missing && core.matchesPhoto(p, settings)).map(p => [p.id, p]));
      const photos = current.result.photos.filter(p => valid.has(p.id)).map(p => valid.get(p.id));
      if (!photos.length && valid.size) current.result = null;
      else if (photos.length !== current.result.photos.length || photos.some((p, i) => p !== current.result.photos[i])) {
        current.result = { ...current.result, photos, selectedId: photos.some(p => p.id === current.result.selectedId) ? current.result.selectedId : photos[0]?.id || '', revision: ++revision };
        publish(current.result);
      }
    }
    if (current.result && !refresh) return current.result;
    current.pending = (async () => {
      let photos;
      if (settings.rotationSource === 'online') {
        const result = await randomPhotos({ ...settings.onlineSource, orientation: settings.orientation, minWidth: settings.minWidth }, current.recent);
        photos = [...new Map(result.photos.map(p => [p.id, p])).values()].slice(0, 12);
      } else {
        const pool = localPhotos(settings).filter(p => !p.missing && core.matchesPhoto(p, settings));
        photos = preferUnseen(pool, current.recent).slice(0, 12);
      }
      if (active !== current) throw new Error('Selection source changed');
      const result = { key: current.key, photos, selectedId: photos[0]?.id || '', revision: ++revision };
      current.result = result;
      current.recent = [...new Set([...photos.map(p => p.id), ...current.recent])].slice(0, 72);
      if (active === current) publish(result);
      return result;
    })();
    try { return await current.pending; } finally { current.pending = null; }
  }
  async function select(settings, id) {
    const current = entry(settings);
    const result = await get(settings);
    if (current !== active) throw new Error('Selection source changed');
    const photo = id === undefined ? result.photos.length ? core.nextPhoto(result.photos, result.selectedId, 'shuffle') : null : result.photos.find(p => p.id === id);
    if (!photo) throw new Error('Selection is not in the current batch');
    const selected = { ...result, selectedId: photo.id, revision: ++revision };
    active.result = selected; publish(selected); return selected;
  }
  function reconcile(settings) {
    if (settings.rotationSource !== 'online' && active && active.key === batchKey(settings)) return get(settings);
  }
  return { get, select, reconcile };
}
module.exports = { createPhotoBatch, batchKey, fetchRandomBatch };
