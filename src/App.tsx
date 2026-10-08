import { useEffect, useRef, useState } from 'react';
import { ArrowRight, FolderOpen, LoaderCircle, Shuffle } from 'lucide-react';
import type { AppState, OnlineSource, Photo, Settings } from './types';
import { demoPhotos, initial } from './data';
import { friendly, intervals, isLocalKind, kindLabel, matches, normalizeSource, read, sourceName, type Failure, type Page, type Theme } from './lib/sources';
import { resolveLanguage, setLanguage, useI18n } from './i18n';
import Sidebar from './components/Sidebar';
import PageHeader from './components/PageHeader';
import KeyPanel from './components/KeyPanel';
import FilterControls from './components/FilterControls';
import SourcePanel from './components/SourcePanel';
import NowShowing from './components/NowShowing';
import PreviewDialog from './components/PreviewDialog';
import WallpaperBar from './components/WallpaperBar';
import ErrorPanel from './components/ErrorPanel';
import Toast from './components/Toast';
import HomePage from './pages/HomePage';
import GalleryPage from './pages/GalleryPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const api = window.framewall;
  const { t } = useI18n();
  const [state, setState] = useState<AppState>(initial);
  const [page, setPage] = useState<Page>('home');
  const [initialized, setInitialized] = useState(false);
  const [draft, setDraft] = useState<OnlineSource>({ kind: 'search', value: 'mountains', name: '' });
  const [filters, setFilters] = useState(initial.settings);
  const [browseSource, setBrowseSource] = useState<OnlineSource>(draft);
  const [remote, setRemote] = useState<Photo[]>([]);
  const [nextPage, setNextPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [changing, setChanging] = useState('');
  const [customInterval, setCustomInterval] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('60');
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [selected, setSelected] = useState<Photo | null>(null);
  const [theme, setTheme] = useState<Theme>(() => read('framewall-theme', 'light'));
  const [cache, setCache] = useState({ bytes: 0, files: 0 });
  const [savedSources, setSavedSources] = useState<OnlineSource[]>(() => read('framewall-sources', []));
  const inputFile = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const report = (step: string, e: unknown) => { setFailure({ step, message: friendly(e), at: new Date().toLocaleTimeString() }); setSelected(null); window.scrollTo({ top: 0 }); };

  useEffect(() => {
    function restore(s: AppState) {
      setState(s); setFilters(s.settings);
      setCustomInterval(!intervals.includes(s.settings.interval)); setCustomMinutes(String(s.settings.interval));
      if (s.settings.rotationSource === 'online' && (s.settings.onlineSource.value || s.settings.onlineSource.kind === 'discover')) setDraft(s.settings.onlineSource);
      else if (isLocalKind(s.settings.rotationSource) && s.photos.length) setDraft({ kind: s.settings.rotationSource, value: '', name: '' });
      setInitialized(true);
    }
    if (api) {
      api.bootstrap().then(restore).catch(e => { report(t('step.bootstrap'), e); setInitialized(true); });
      api.credential().then(setKeyInput).catch(e => report(t('step.credential'), e));
      const stopUpdate = api.onUpdate(s => { setState(s); if (s.error) report(t('step.auto'), s.error); });
      const stopProgress = api.onProgress(setProgress);
      const stopChanging = api.onChanging(setChanging);
      return () => { stopUpdate(); stopProgress(); stopChanging(); };
    }
    const saved = read<Partial<AppState>>('framewall-preview', {});
    restore({ ...initial, ...saved, connected: false, settings: { ...initial.settings, ...saved.settings } });
  }, []);
  useEffect(() => { if (!api && initialized) localStorage.setItem('framewall-preview', JSON.stringify({ ...state, photos: state.photos.filter(p => !p.thumb.startsWith('blob:')) })); }, [state, initialized]);
  useEffect(() => { localStorage.setItem('framewall-sources', JSON.stringify(savedSources)); }, [savedSources]);
  useEffect(() => {
    localStorage.setItem('framewall-theme', JSON.stringify(theme));
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme; };
    apply();
    if (theme !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    if (!initialized) return;
    const pref = state.settings.language;
    setLanguage(pref === 'zh' || pref === 'en' ? pref : resolveLanguage(navigator.languages));
  }, [initialized, state.settings.language]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [page]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); } }, [notice]);
  useEffect(() => { if (page === 'settings' && api) api.cache().then(setCache).catch(e => report(t('step.cache'), e)); }, [page]);
  useEffect(() => {
    const id = ++requestId.current; setRemote([]); setHasMore(false); setLoading(false);
    if (!initialized || page !== 'browse' || !api || !state.connected) return;
    setLoading(true);
    api.query({ ...browseSource, page: 1, sort: 'latest', orientation: filters.orientation, minWidth: filters.minWidth })
      .then(r => { if (id === requestId.current) { setRemote(r.photos); setNextPage(r.nextPage); setHasMore(r.hasMore); } })
      .catch(e => { if (id === requestId.current) report(t('step.browse', { kind: kindLabel(browseSource.kind), name: sourceName(browseSource) }), e); })
      .finally(() => { if (id === requestId.current) setLoading(false); });
  }, [page, initialized, state.connected, browseSource, filters.orientation, filters.minWidth]);
  useEffect(() => { if (!selected) return; const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); }; document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape); }, [selected]);

  async function action(step: string, work: () => Promise<void>) {
    if (busy) return false; setBusy(true);
    try { await work(); setFailure(null); return true; }
    catch (e) { report(step, e); return false; }
    finally { setBusy(false); }
  }
  function desktop() { if (api) return true; report(t('step.desktop'), t('err.browserOnly')); return false; }
  async function connect() {
    if (!desktop()) return;
    await action(t('step.connect'), async () => { setState(await api!.connect(keyInput)); setKeyInput(await api!.credential()); setShowKey(false); setPage('home'); setNotice(t('notice.keySaved')); });
  }
  async function disconnect() {
    await action(t('step.disconnect'), async () => { setState(await api!.disconnect()); setKeyInput(''); setShowKey(false); });
  }
  async function changeSettings(patch: Partial<Settings>) {
    if (!api) { setState(s => ({ ...s, settings: { ...s.settings, ...patch } })); return; }
    await action(t('step.settings'), async () => { setState(await api.settings({ ...state.settings, ...patch })); });
  }
  async function start(s = draft) {
    if (!desktop()) return;
    await action(t('step.start', { kind: kindLabel(s.kind) }), async () => {
      const normalized = normalizeSource(s); const online = !isLocalKind(s.kind);
      const interval = customInterval ? Number(customMinutes) : filters.interval;
      if (!Number.isInteger(interval) || interval < 1 || interval > 10080) throw new Error(t('err.interval'));
      if (online && !state.connected) throw new Error(t('err.needKey'));
      const settings = { ...state.settings, orientation: filters.orientation, minWidth: filters.minWidth, interval, rotationSource: online ? 'online' : s.kind, onlineSource: online ? normalized : state.settings.onlineSource, order: 'shuffle', rotation: false };
      setState(await api!.settings(settings));
      const applied = await api!.next(); setState(applied);
      setState(await api!.settings({ ...applied.settings, rotation: true }));
      setDraft(normalized);
      if (online) setSavedSources(old => [normalized, ...old.filter(x => x.kind !== normalized.kind || x.value !== normalized.value)].slice(0, 5));
      setPage('home'); setNotice(t('notice.started'));
    });
  }
  function browse(s = draft) {
    try { const normalized = normalizeSource(s); setBrowseSource(normalized); setPage(s.kind === 'favorites' ? 'favorites' : s.kind === 'library' ? 'library' : 'browse'); }
    catch (e) { report(t('step.browseSource'), e); }
  }
  async function next() { if (desktop()) await action(t('step.next'), async () => { setState(await api!.next()); setNotice(t('notice.next')); }); }
  async function favorite(p: Photo) {
    if (p.source === 'demo') { report(t('step.favorite'), t('err.demoFavorite')); return; }
    if (api) await action(t('step.favorite'), async () => { setState(await api.favorite({ id: p.id })); });
    else setState(s => ({ ...s, favorites: s.favorites.includes(p.id) ? s.favorites.filter(id => id !== p.id) : [...s.favorites, p.id] }));
  }
  async function importPhotos() {
    if (!api) { inputFile.current?.click(); return; }
    await action(t('step.import'), async () => { const imported = await api.import(); setState(imported); setDraft({ kind: 'library', value: '', name: '' }); setPage('library'); if (imported.importFailed) setNotice(t('notice.importSkipped', { count: imported.importFailed })); });
  }
  async function webImport(files: FileList | null) {
    if (!files) return; const photos: Photo[] = [];
    for (const file of Array.from(files).filter(f => f.type.startsWith('image/'))) {
      const url = URL.createObjectURL(file); const size = await new Promise<{ width: number; height: number } | null>(resolve => { const img = new window.Image(); img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight }); img.onerror = () => resolve(null); img.src = url; });
      if (size) photos.push({ id: crypto.randomUUID(), source: 'local', title: file.name, ...size, thumb: url, full: url, author: t('photo.mine') }); else URL.revokeObjectURL(url);
    }
    setState(s => ({ ...s, photos: [...s.photos, ...photos] })); setDraft({ kind: 'library', value: '', name: '' }); setPage('library'); setNotice(t('notice.webImported'));
  }
  async function loadMore() {
    if (!api || loading) return; const id = requestId.current; setLoading(true);
    try { const r = await api.query({ ...browseSource, page: nextPage, sort: 'latest', orientation: filters.orientation, minWidth: filters.minWidth }); if (id === requestId.current) { setRemote(old => [...old, ...r.photos.filter(p => !old.some(x => x.id === p.id))]); setNextPage(r.nextPage); setHasMore(r.hasMore); } }
    catch (e) { if (id === requestId.current) report(t('step.loadMore'), e); }
    finally { if (id === requestId.current) setLoading(false); }
  }
  function link(url?: string) { if (!url) return; if (api) void action(t('step.link'), async () => { await api.openLink({ url }); }); else window.open(url, '_blank', 'noopener,noreferrer'); }
  function copyFailure(f: Failure) { void navigator.clipboard.writeText(`${f.step}\n${f.message}`).then(() => setNotice(t('notice.copied'))).catch(() => setNotice(t('notice.copyFailed'))); }

  const current = state.photos.find(p => p.id === state.current?.id);
  const activeSource = state.settings.rotationSource === 'online' ? state.settings.onlineSource.value || state.settings.onlineSource.kind === 'discover' ? sourceName(state.settings.onlineSource) : t('source.none') : isLocalKind(state.settings.rotationSource) ? kindLabel(state.settings.rotationSource) : t('source.legacy');
  const preview = page === 'browse' && !state.connected;
  const photos = (page === 'browse' ? preview ? demoPhotos() : remote : page === 'favorites' ? state.photos.filter(p => state.favorites.includes(p.id)) : state.photos.filter(p => p.source === 'local')).filter(p => matches(p, filters));

  const keyPanel = <KeyPanel connected={state.connected} desktop={!!api} busy={busy} keyInput={keyInput} setKeyInput={setKeyInput} showKey={showKey} setShowKey={setShowKey} onConnect={() => void connect()} onDisconnect={() => void disconnect()} onImport={() => void importPhotos()} onLink={link}/>;
  const intervalState = { custom: customInterval, setCustom: setCustomInterval, minutes: customMinutes, setMinutes: setCustomMinutes };
  const toHome = <button className="button secondary" onClick={() => setPage('home')}>{t('home.chooseSource')} <ArrowRight size={14}/></button>;

  function content() {
    if (page === 'home') return <HomePage
      header={<PageHeader title={t('nav.home')} description={t('home.description')}/>}
      nowShowing={current && <NowShowing photo={current} source={activeSource} liked={state.favorites.includes(current.id)} onFavorite={() => void favorite(current)} onOpen={() => setSelected(current)}/>}
      connected={state.connected} keyPanel={keyPanel} onManageKey={() => setPage('settings')}
      sourcePanel={<SourcePanel draft={draft} setDraft={setDraft} savedSources={savedSources} favorites={state.favorites.length} busy={busy} initialized={initialized}
        filters={<FilterControls filters={filters} setFilters={setFilters} busy={busy} interval={intervalState} className="source-filters"/>}
        onBrowse={() => browse()} onStart={() => void start()} onImport={() => void importPhotos()} onOpenFavorites={() => setPage('favorites')}/>}/>;
    if (page === 'settings') return <SettingsPage settings={state.settings} busy={busy} cache={cache} theme={theme} setTheme={setTheme}
      header={<PageHeader title={t('nav.settings')}/>} keyPanel={keyPanel}
      onChange={patch => void changeSettings(patch)} onLink={link}
      onClearCache={() => { if (desktop()) void action(t('step.clearCache'), async () => { setCache(await api!.clearCache()); setNotice(t('notice.cacheCleared')); }); }}/>;
    const gallery = page;
    return <GalleryPage kind={gallery} photos={photos} favorites={state.favorites} loading={loading} hasMore={hasMore} demo={preview}
      header={<PageHeader
        title={gallery === 'browse' ? sourceName(browseSource) : kindLabel(gallery)}
        description={t(gallery === 'favorites' ? 'gallery.favoritesDesc' : gallery === 'library' ? 'gallery.libraryDesc' : 'gallery.browseDesc')}
        actions={<>
          {toHome}
          {gallery === 'library' && <button className="button secondary" onClick={() => void importPhotos()}><FolderOpen size={14}/>{t('gallery.import')}</button>}
          <button className="button primary" disabled={busy} onClick={() => void start(gallery === 'browse' ? browseSource : { kind: gallery, value: '', name: '' })}><Shuffle size={14}/>{t(gallery === 'browse' ? 'gallery.useSource' : 'gallery.usePhotos')}</button>
        </>}/>}
      filters={<FilterControls filters={filters} setFilters={setFilters} busy={busy} className="inline"/>}
      onOpen={setSelected} onFavorite={p => void favorite(p)} onLoadMore={() => void loadMore()}
      onGoHome={() => setPage('home')} onClearFilters={() => setFilters(s => ({ ...s, orientation: 'all', minWidth: 0 }))}/>;
  }

  return <div className="app-shell">
    <Sidebar page={page} setPage={setPage} favorites={state.favorites.length} connected={state.connected} desktop={!!api}/>
    <main className="workspace">
      <div className="page-content">
        {progress && <div className="retry-progress" role="status" aria-live="polite"><LoaderCircle size={15} className="spin"/>{progress}</div>}
        {failure && <ErrorPanel failure={failure} onClose={() => setFailure(null)} onCopy={() => copyFailure(failure)}/>}
        {content()}
      </div>
      <WallpaperBar current={current} hasCurrent={!!state.current} source={activeSource} changing={changing} busy={busy} rotation={state.settings.rotation} interval={state.settings.interval}
        onToggleRotation={() => void changeSettings({ rotation: !state.settings.rotation })} onNext={() => void next()} onChooseSource={() => setPage('home')}/>
    </main>
    <input type="file" multiple accept="image/*" className="hidden" ref={inputFile} onChange={e => void webImport(e.target.files)}/>
    {selected && <PreviewDialog photo={selected} liked={state.favorites.includes(selected.id)} busy={busy} onClose={() => setSelected(null)} onLink={link}
      onFavorite={() => void favorite(selected)}
      onSetWallpaper={() => { if (desktop()) void action(t('step.setWallpaper'), async () => { setState(await api!.wallpaper({ id: selected.id })); setSelected(null); setNotice(t('notice.wallpaperSet')); }); }}
      onDownload={() => { if (desktop()) void action(t('step.download'), async () => { const r = await api!.download({ id: selected.id }); if (!r.canceled) setNotice(t('notice.photoSaved')); }); }}/>}
    {notice && <Toast message={notice} onClose={() => setNotice('')}/>}
  </div>;
}
