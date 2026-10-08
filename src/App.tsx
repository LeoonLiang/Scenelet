import { useEffect, useRef, useState } from 'react';
import { ArrowRight, FolderOpen, LoaderCircle, Shuffle } from 'lucide-react';
import type { AppState, OnlineSource, Photo, Settings } from './types';
import { demos, initial } from './data';
import { friendly, intervals, isLocalKind, labels, matches, normalizeSource, read, type Failure, type Page, type Theme } from './lib/sources';
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
  const [state, setState] = useState<AppState>(initial);
  const [page, setPage] = useState<Page>('home');
  const [initialized, setInitialized] = useState(false);
  const [draft, setDraft] = useState<OnlineSource>({ kind: 'search', value: 'mountains', name: '山野' });
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
      else if (isLocalKind(s.settings.rotationSource) && s.photos.length) setDraft({ kind: s.settings.rotationSource, value: '', name: labels[s.settings.rotationSource] });
      setInitialized(true);
    }
    if (api) {
      api.bootstrap().then(restore).catch(e => { report('读取本机配置', e); setInitialized(true); });
      api.credential().then(setKeyInput).catch(e => report('读取已保存的 Key', e));
      const stopUpdate = api.onUpdate(s => { setState(s); if (s.error) report('后台自动换壁纸', s.error); });
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
  useEffect(() => { window.scrollTo({ top: 0 }); }, [page]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); } }, [notice]);
  useEffect(() => { if (page === 'settings' && api) api.cache().then(setCache).catch(e => report('读取缓存', e)); }, [page]);
  useEffect(() => {
    const id = ++requestId.current; setRemote([]); setHasMore(false); setLoading(false);
    if (!initialized || page !== 'browse' || !api || !state.connected) return;
    setLoading(true);
    api.query({ ...browseSource, page: 1, sort: 'latest', orientation: filters.orientation, minWidth: filters.minWidth })
      .then(r => { if (id === requestId.current) { setRemote(r.photos); setNextPage(r.nextPage); setHasMore(r.hasMore); } })
      .catch(e => { if (id === requestId.current) report(`浏览${labels[browseSource.kind]}：${browseSource.name}`, e); })
      .finally(() => { if (id === requestId.current) setLoading(false); });
  }, [page, initialized, state.connected, browseSource, filters.orientation, filters.minWidth]);
  useEffect(() => { if (!selected) return; const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); }; document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape); }, [selected]);

  async function action(step: string, work: () => Promise<void>) {
    if (busy) return false; setBusy(true);
    try { await work(); setFailure(null); return true; }
    catch (e) { report(step, e); return false; }
    finally { setBusy(false); }
  }
  function desktop() { if (api) return true; report('桌面功能', '当前是浏览器界面预览。请在桌面客户端中连接 Key、下载和设置壁纸。'); return false; }
  async function connect() {
    if (!desktop()) return;
    await action('验证并保存 Unsplash Key', async () => { setState(await api!.connect(keyInput)); setKeyInput(await api!.credential()); setShowKey(false); setPage('home'); setNotice('Key 已加密保存。接下来选择照片来源。'); });
  }
  async function disconnect() {
    await action('移除已保存 Key', async () => { setState(await api!.disconnect()); setKeyInput(''); setShowKey(false); });
  }
  async function changeSettings(patch: Partial<Settings>) {
    if (!api) { setState(s => ({ ...s, settings: { ...s.settings, ...patch } })); return; }
    await action('保存偏好', async () => { setState(await api.settings({ ...state.settings, ...patch })); });
  }
  async function start(s = draft) {
    if (!desktop()) return;
    await action(`开始换壁纸（${labels[s.kind]}）`, async () => {
      const normalized = normalizeSource(s); const online = !isLocalKind(s.kind);
      const interval = customInterval ? Number(customMinutes) : filters.interval;
      if (!Number.isInteger(interval) || interval < 1 || interval > 10080) throw new Error('自定义间隔请输入 1 到 10080 之间的整数分钟（最长 7 天）。');
      if (online && !state.connected) throw new Error('请先连接 Unsplash Access Key。');
      const settings = { ...state.settings, orientation: filters.orientation, minWidth: filters.minWidth, interval, rotationSource: online ? 'online' : s.kind, onlineSource: online ? normalized : state.settings.onlineSource, order: 'shuffle', rotation: false };
      setState(await api!.settings(settings));
      const applied = await api!.next(); setState(applied);
      setState(await api!.settings({ ...applied.settings, rotation: true }));
      setDraft(normalized);
      if (online) setSavedSources(old => [normalized, ...old.filter(x => x.kind !== normalized.kind || x.value !== normalized.value)].slice(0, 5));
      setPage('home'); setNotice('第一张壁纸已设置，自动换图已开启。');
    });
  }
  function browse(s = draft) {
    try { const normalized = normalizeSource(s); setBrowseSource(normalized); setPage(s.kind === 'favorites' ? 'favorites' : s.kind === 'library' ? 'library' : 'browse'); }
    catch (e) { report('浏览来源', e); }
  }
  async function next() { if (desktop()) await action('获取并设置下一张壁纸', async () => { setState(await api!.next()); setNotice('已换下一张。'); }); }
  async function favorite(p: Photo) {
    if (p.source === 'demo') { report('收藏照片', '这是界面示例。连接 Key 后可以收藏真实照片。'); return; }
    if (api) await action('收藏照片', async () => { setState(await api.favorite({ id: p.id })); });
    else setState(s => ({ ...s, favorites: s.favorites.includes(p.id) ? s.favorites.filter(id => id !== p.id) : [...s.favorites, p.id] }));
  }
  async function importPhotos() {
    if (!api) { inputFile.current?.click(); return; }
    await action('导入本地照片', async () => { const imported = await api.import(); setState(imported); setDraft({ kind: 'library', value: '', name: '本地照片' }); setPage('library'); if (imported.importFailed) setNotice(`${imported.importFailed} 张无法读取的文件已跳过，请检查文件格式。`); });
  }
  async function webImport(files: FileList | null) {
    if (!files) return; const photos: Photo[] = [];
    for (const file of Array.from(files).filter(f => f.type.startsWith('image/'))) {
      const url = URL.createObjectURL(file); const size = await new Promise<{ width: number; height: number } | null>(resolve => { const img = new window.Image(); img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight }); img.onerror = () => resolve(null); img.src = url; });
      if (size) photos.push({ id: crypto.randomUUID(), source: 'local', title: file.name, ...size, thumb: url, full: url, author: '我的照片' }); else URL.revokeObjectURL(url);
    }
    setState(s => ({ ...s, photos: [...s.photos, ...photos] })); setDraft({ kind: 'library', value: '', name: '本地照片' }); setPage('library'); setNotice('本次预览导入成功。桌面版会保存照片索引。');
  }
  async function loadMore() {
    if (!api || loading) return; const id = requestId.current; setLoading(true);
    try { const r = await api.query({ ...browseSource, page: nextPage, sort: 'latest', orientation: filters.orientation, minWidth: filters.minWidth }); if (id === requestId.current) { setRemote(old => [...old, ...r.photos.filter(p => !old.some(x => x.id === p.id))]); setNextPage(r.nextPage); setHasMore(r.hasMore); } }
    catch (e) { if (id === requestId.current) report('加载下一页照片', e); }
    finally { if (id === requestId.current) setLoading(false); }
  }
  function link(url?: string) { if (!url) return; if (api) void action('打开来源链接', async () => { await api.openLink({ url }); }); else window.open(url, '_blank', 'noopener,noreferrer'); }
  function copyFailure(f: Failure) { void navigator.clipboard.writeText(`${f.step}\n${f.message}`).then(() => setNotice('错误详情已复制。')).catch(() => setNotice('无法复制，请手动选择错误详情。')); }

  const current = state.photos.find(p => p.id === state.current?.id);
  const activeSource = state.settings.rotationSource === 'online' ? state.settings.onlineSource.name || state.settings.onlineSource.value || '尚未选择' : state.settings.rotationSource === 'favorites' ? '我的收藏' : state.settings.rotationSource === 'library' ? '本地照片' : '旧版自选照片组';
  const preview = page === 'browse' && !state.connected;
  const photos = (page === 'browse' ? preview ? demos : remote : page === 'favorites' ? state.photos.filter(p => state.favorites.includes(p.id)) : state.photos.filter(p => p.source === 'local')).filter(p => matches(p, filters));

  const keyPanel = <KeyPanel connected={state.connected} desktop={!!api} busy={busy} keyInput={keyInput} setKeyInput={setKeyInput} showKey={showKey} setShowKey={setShowKey} onConnect={() => void connect()} onDisconnect={() => void disconnect()} onImport={() => void importPhotos()}/>;
  const intervalState = { custom: customInterval, setCustom: setCustomInterval, minutes: customMinutes, setMinutes: setCustomMinutes };
  const toHome = <button className="button secondary" onClick={() => setPage('home')}>选择来源 <ArrowRight size={14}/></button>;

  function content() {
    if (page === 'home') return <HomePage
      header={<PageHeader title="换壁纸" description="选一个照片来源，拾景会按间隔自动换壁纸。"/>}
      nowShowing={current && <NowShowing photo={current} source={activeSource} liked={state.favorites.includes(current.id)} onFavorite={() => void favorite(current)} onOpen={() => setSelected(current)}/>}
      connected={state.connected} keyPanel={keyPanel} onManageKey={() => setPage('settings')}
      sourcePanel={<SourcePanel draft={draft} setDraft={setDraft} savedSources={savedSources} favorites={state.favorites.length} busy={busy} initialized={initialized}
        filters={<FilterControls filters={filters} setFilters={setFilters} busy={busy} interval={intervalState} className="source-filters"/>}
        onBrowse={() => browse()} onStart={() => void start()} onImport={() => void importPhotos()} onOpenFavorites={() => setPage('favorites')}/>}/>;
    if (page === 'settings') return <SettingsPage settings={state.settings} busy={busy} cache={cache} theme={theme} setTheme={setTheme}
      header={<PageHeader title="偏好设置"/>} keyPanel={keyPanel}
      onChange={patch => void changeSettings(patch)} onLink={link}
      onClearCache={() => { if (desktop()) void action('清理缓存', async () => { setCache(await api!.clearCache()); setNotice('缓存已清理。'); }); }}/>;
    const gallery = page;
    return <GalleryPage kind={gallery} photos={photos} favorites={state.favorites} loading={loading} hasMore={hasMore} demo={preview}
      header={<PageHeader
        title={gallery === 'browse' ? browseSource.name : labels[gallery]}
        description={gallery === 'favorites' ? '浏览时点爱心收藏的照片。可以只用这些照片换壁纸。' : gallery === 'library' ? '用自己的照片，不需要连接 Unsplash。' : '这里只显示一部分照片。开始换壁纸后，会从整个来源随机抽取。'}
        actions={<>
          {toHome}
          {gallery === 'library' && <button className="button secondary" onClick={() => void importPhotos()}><FolderOpen size={14}/>导入照片</button>}
          <button className="button primary" disabled={busy} onClick={() => void start(gallery === 'browse' ? browseSource : { kind: gallery, value: '', name: labels[gallery] })}><Shuffle size={14}/>{gallery === 'browse' ? '用整个来源换壁纸' : '用这些照片换壁纸'}</button>
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
      onSetWallpaper={() => { if (desktop()) void action('设置这张照片为壁纸', async () => { setState(await api!.wallpaper({ id: selected.id })); setSelected(null); setNotice('壁纸已设置。'); }); }}
      onDownload={() => { if (desktop()) void action('下载照片', async () => { const r = await api!.download({ id: selected.id }); if (!r.canceled) setNotice('照片已保存。'); }); }}/>}
    {notice && <Toast message={notice} onClose={() => setNotice('')}/>}
  </div>;
}
