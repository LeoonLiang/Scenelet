import { useEffect, useRef, useState } from 'react';
import { Aperture, ArrowDownToLine, ArrowRight, Check, CheckCircle2, Copy, ExternalLink, Eye, EyeOff, FolderOpen, Heart, Image, LoaderCircle, Monitor, Moon, Pause, Play, Settings2, Shuffle, Sun, X } from 'lucide-react';
import type { AppState, OnlineSource, Photo, Settings } from './types';
import { demos, initial, keywords, tags } from './data';
import UpdatePanel from './UpdatePanel';
import { appVersion } from './version';
import logoUrl from './assets/logo.png';

type Failure = { step: string; message: string; at: string };
const intervals = [15, 30, 60, 180, 360, 1440];
const read = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
const friendly = (e: unknown) => String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': Error: /, '');
const labels: Record<string, string> = { search: '分类', author: '作者', collection: 'Collection', topic: '主题', favorites: '我的收藏', library: '本地照片', discover: '全部照片' };
const matches = (p: Photo, s: Settings) => { const ratio = p.width / p.height; return (s.orientation === 'all' || s.orientation === 'landscape' && ratio > 1.1 || s.orientation === 'portrait' && ratio < .9 || s.orientation === 'squarish' && ratio >= .9 && ratio <= 1.1) && p.width >= s.minWidth; };
function normalizeSource(s: OnlineSource): OnlineSource {
  let value = s.value.trim();
  if (value.includes('://')) {
    const url = new URL(value); const parts = url.pathname.split('/').filter(Boolean);
    if (url.protocol !== 'https:' || url.hostname !== 'unsplash.com') throw new Error('请输入 https://unsplash.com 的来源链接。');
    if (s.kind === 'author' && parts[0]?.startsWith('@')) value = parts[0].slice(1);
    else if (s.kind === 'collection' && parts[0] === 'collections') value = parts[1] || '';
    else if (s.kind === 'topic' && ['t', 'topics'].includes(parts[0])) value = parts[1] || '';
    else throw new Error('链接类型与所选来源不一致，请选择作者、Collection 或主题。');
  }
  if (s.kind === 'author') value = value.replace(/^@/, '');
  if (!value && !['discover', 'favorites', 'library'].includes(s.kind)) throw new Error(`请先填写${labels[s.kind]}来源。`);
  if (['author', 'collection', 'topic'].includes(s.kind) && !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error('用户名或来源 ID 无效，请粘贴完整 Unsplash 链接。');
  return { ...s, value, name: s.name || (s.kind === 'author' ? `@${value}` : value || labels[s.kind]) };
}

export default function App() {
  const api = window.framewall;
  const [state, setState] = useState<AppState>(initial);
  const [page, setPage] = useState('home');
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
  const [customInterval, setCustomInterval] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('60');
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [selected, setSelected] = useState<Photo | null>(null);
  const [theme, setTheme] = useState(() => read('framewall-theme', 'light'));
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
      else if (['favorites', 'library'].includes(s.settings.rotationSource) && s.photos.length) setDraft({ kind: s.settings.rotationSource, value: '', name: labels[s.settings.rotationSource] });
      setInitialized(true);
    }
    if (api) {
      api.bootstrap().then(restore).catch(e => { report('读取本机配置', e); setInitialized(true); });
      api.credential().then(setKeyInput).catch(e => report('读取已保存的 Key', e));
      const stopUpdate = api.onUpdate(s => { setState(s); if (s.error) report('后台自动换壁纸', s.error); });
      const stopProgress = api.onProgress(setProgress);
      return () => { stopUpdate(); stopProgress(); };
    }
    const saved = read<Partial<AppState>>('framewall-preview', {});
    restore({ ...initial, ...saved, connected: false, settings: { ...initial.settings, ...saved.settings } });
  }, []);
  useEffect(() => { if (!api && initialized) localStorage.setItem('framewall-preview', JSON.stringify({ ...state, photos: state.photos.filter(p => !p.thumb.startsWith('blob:')) })); }, [state, initialized]);
  useEffect(() => { localStorage.setItem('framewall-sources', JSON.stringify(savedSources)); }, [savedSources]);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('framewall-theme', JSON.stringify(theme)); }, [theme]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [page]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); } }, [notice]);
  useEffect(() => { if (page === 'settings' && api) api.cache().then(setCache).catch(e => report('读取缓存', e)); }, [page]);
  useEffect(() => {
    const id = ++requestId.current; setRemote([]); setHasMore(false); setLoading(false);
    if (!initialized || page !== 'browse' || !api || !state.connected) return;
    setLoading(true);
    api.query({ ...browseSource, page: 1, sort: 'latest', orientation: filters.orientation, minWidth: filters.minWidth }).then(r => { if (id === requestId.current) { setRemote(r.photos); setNextPage(r.nextPage); setHasMore(r.hasMore); } }).catch(e => { if (id === requestId.current) report(`浏览${labels[browseSource.kind]}：${browseSource.name}`, e); }).finally(() => { if (id === requestId.current) setLoading(false); });
  }, [page, initialized, state.connected, browseSource, filters.orientation, filters.minWidth]);
  useEffect(() => { if (!selected) return; const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); }; document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape); }, [selected]);
  async function action(step: string, work: () => Promise<void>) {
    if (busy) return false; setBusy(true);
    try { await work(); setFailure(null); return true; }
    catch (e) { report(step, e); return false; }
    finally { setBusy(false); }
  }
  function desktop() { if (api) return true; report('桌面功能', '当前是浏览器界面预览。请运行 Scenelet.exe，连接 Key、下载和设置壁纸。'); return false; }
  async function connect() {
    if (!desktop()) return;
    await action('验证并保存 Unsplash Key', async () => { setState(await api!.connect(keyInput)); setKeyInput(await api!.credential()); setShowKey(false); setPage('home'); setNotice('Key 已加密保存。接下来选择照片来源。'); });
  }
  async function changeSettings(patch: Partial<Settings>) {
    if (!api) { setState(s => ({ ...s, settings: { ...s.settings, ...patch } })); return; }
    await action('保存偏好', async () => { setState(await api.settings({ ...state.settings, ...patch })); });
  }
  async function start(s = draft) {
    if (!desktop()) return;
    await action(`开始换壁纸 · ${labels[s.kind]}`, async () => {
      const normalized = normalizeSource(s); const online = !['favorites', 'library'].includes(s.kind);
      const interval = customInterval ? Number(customMinutes) : filters.interval;
      if (!Number.isInteger(interval) || interval < 1 || interval > 10080) throw new Error('自定义间隔请输入 1–10080 之间的整数分钟（最长 7 天）。');
      if (online && !state.connected) throw new Error('请先完成首页第 1 步：连接 Unsplash Access Key。');
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
    if (p.source === 'demo') { report('收藏照片', '这是界面示例。连接 Key 后可收藏真实照片。'); return; }
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
    setState(s => ({ ...s, photos: [...s.photos, ...photos] })); setDraft({ kind: 'library', value: '', name: '本地照片' }); setPage('library'); setNotice('本次预览导入成功；桌面版会保存照片索引。');
  }
  async function loadMore() {
    if (!api || loading) return; const id = requestId.current; setLoading(true);
    try { const r = await api.query({ ...browseSource, page: nextPage, sort: 'latest', orientation: filters.orientation, minWidth: filters.minWidth }); if (id === requestId.current) { setRemote(old => [...old, ...r.photos.filter(p => !old.some(x => x.id === p.id))]); setNextPage(r.nextPage); setHasMore(r.hasMore); } }
    catch (e) { if (id === requestId.current) report('加载下一页照片', e); }
    finally { if (id === requestId.current) setLoading(false); }
  }
  function link(url?: string) { if (!url) return; if (api) void action('打开来源链接', async () => { await api.openLink({ url }); }); else window.open(url, '_blank', 'noopener,noreferrer'); }
  const current = state.photos.find(p => p.id === state.current?.id);
  const activeSource = state.settings.rotationSource === 'online' ? state.settings.onlineSource.name || state.settings.onlineSource.value || '尚未选择' : state.settings.rotationSource === 'favorites' ? '我的收藏' : state.settings.rotationSource === 'library' ? '本地照片' : '旧版自选照片组';
  const preview = page === 'browse' && !state.connected;
  const photos = (page === 'browse' ? preview ? demos : remote : page === 'favorites' ? state.photos.filter(p => state.favorites.includes(p.id)) : state.photos.filter(p => p.source === 'local')).filter(p => matches(p, filters));
  const titles: Record<string, string> = { home: '你的下一张风景', browse: browseSource.name, favorites: '我的收藏', library: '本地照片', settings: '偏好设置' };
  const local = ['favorites', 'library'].includes(draft.kind);
  function keyPanel() {
    return <section className={`settings-panel connection-panel ${state.connected ? 'is-connected' : ''}`}>
      <div className="panel-heading"><span className="step-number">1</span><div><h2>{state.connected ? 'Unsplash 已连接' : '先连接你的 Unsplash'}</h2><p>{state.connected ? 'Key 已加密保存在本机，下次打开自动恢复。' : '粘贴 Access Key，连接后即可使用在线照片。'}</p></div>{state.connected && <CheckCircle2 size={23}/>}</div>
      <form onSubmit={e => { e.preventDefault(); void connect(); }}><label className="field-label" htmlFor="access-key">Unsplash Access Key</label><div className="key-row"><div className="key-input-wrap"><input id="access-key" type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="粘贴 Access Key（不是 Secret Key）"/><button type="button" className="icon-btn" aria-label={showKey ? '隐藏 Key' : '显示 Key'} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div><button type="submit" disabled={busy || !keyInput.trim()} className="button primary">{busy ? <LoaderCircle size={16} className="spin"/> : <Check size={16}/>} {state.connected ? '更新并保存' : '连接并保存'}</button>{state.connected && <button type="button" className="button secondary" disabled={busy} onClick={() => void action('移除已保存 Key', async () => { setState(await api!.disconnect()); setKeyInput(''); setShowKey(false); })}>移除 Key</button>}</div></form>
      <p className="helper">{api ? '可点击眼睛查看或修改已保存的 Key。' : '浏览器仅用于界面预览，Key 请在桌面客户端中连接与保存。'} {!state.connected && <button className="text-button" onClick={() => void importPhotos()}>也可以直接使用本地照片 <ArrowRight size={12}/></button>}</p>
    </section>;
  }
  function filterControls(interval = false) {
    return <div className="setting-grid source-filters"><label>照片方向<select disabled={busy} aria-label="照片方向" value={filters.orientation} onChange={e => setFilters(s => ({ ...s, orientation: e.target.value }))}><option value="landscape">仅横屏</option><option value="portrait">仅竖屏</option><option value="squarish">仅方形</option><option value="all">所有方向</option></select></label><label>最低原图宽度<select disabled={busy} aria-label="最低原图宽度" value={filters.minWidth} onChange={e => setFilters(s => ({ ...s, minWidth: Number(e.target.value) }))}><option value={0}>不限制</option><option value={1920}>1920 px</option><option value={2560}>2560 px</option><option value={3840}>3840 px</option></select></label>{interval && <label>自动换图间隔<select aria-label="自动换图间隔" disabled={busy} value={customInterval ? "custom" : filters.interval} onChange={e => { setCustomInterval(e.target.value === "custom"); if (e.target.value !== "custom") setFilters(s => ({ ...s, interval: Number(e.target.value) })); }}>{intervals.map(v => <option key={v} value={v}>{v < 60 ? `${v} 分钟` : v === 1440 ? "每天" : `${v / 60} 小时`}</option>)}<option value="custom">自定义…</option></select>{customInterval && <div className="custom-interval"><input aria-label="自定义间隔（分钟）" type="number" min="1" max="10080" step="1" disabled={busy} value={customMinutes} onChange={e => setCustomMinutes(e.target.value)}/><span>分钟</span><small>1–10080 分钟，点击开始后生效</small></div>}</label>}</div>;
  }
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><img className="brand-mark" src={logoUrl} alt="" width={40} height={40}/><span>拾景<small>SCENELET · YOUR EVERYDAY VIEW</small></span></div><div className="nav-label">每天一张好风景</div><nav>{[{ id: 'home', text: '换壁纸', Icon: Shuffle }, { id: 'favorites', text: '我的收藏', Icon: Heart }, { id: 'library', text: '本地照片', Icon: FolderOpen }].map(({ id, text, Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}><Icon size={18}/><span>{text}</span>{id === 'favorites' && !!state.favorites.length && <small>{state.favorites.length}</small>}</button>)}</nav><div className="sidebar-bottom"><div className="quiet-card"><Shuffle size={17}/><strong>当前来源</strong><p>{state.current ? activeSource : '还没有设置壁纸'}<br/>{state.settings.rotation ? '自动换图中' : '自动换图已暂停'}</p><button className="text-button" onClick={() => setPage('home')}>更换来源 <ArrowRight size={13}/></button></div><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}><Settings2 size={18}/>偏好设置</button><div className="connection"><i className={state.connected ? 'online' : ''}/>{state.connected ? 'Unsplash 已连接' : api ? '未连接 Unsplash' : '浏览器预览'}<span>v{appVersion}</span></div></div></aside>
    <main className="workspace"><header className="topbar"><div className="breadcrumb">拾景<span>/</span><strong>{titles[page]}</strong></div><div className="top-actions"><button className="icon-btn" title={theme === 'light' ? '深色模式' : '浅色模式'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={18}/> : <Sun size={18}/>}</button><span className="platform"><Monitor size={14}/>{api ? state.platform === 'darwin' ? 'macOS' : 'Windows' : 'WEB PREVIEW'}</span></div></header>
      <div className="page-content"><div className="page-heading"><div><div className="eyebrow">LESS SETUP. MORE SCENERY.</div><h1>{titles[page]}</h1><p>{page === 'home' ? '连接一次，选好来源。其余的，交给下一张风景。' : page === 'favorites' ? '点一下爱心收集照片，用这一组随机换壁纸。' : page === 'library' ? '使用自己的照片，无需连接 Unsplash。' : page === 'browse' ? '浏览喜欢的照片并收藏，随机换图仍从整个来源抽取。' : '把不常用的设置留在这里。'}</p></div>{page !== 'home' && page !== 'settings' && <button className="button secondary" onClick={() => setPage('home')}>选择来源 <ArrowRight size={15}/></button>}</div>
        {progress && <div className="retry-progress" role="status" aria-live="polite"><LoaderCircle size={16} className="spin"/>{progress}</div>}
        {failure && <section className="error-panel" role="alert"><div><strong>{failure.step}失败</strong><button className="icon-btn" title="关闭错误" onClick={() => setFailure(null)}><X size={16}/></button></div><p>{failure.message.split('\n')[0]}</p><details><summary>查看具体错误 · {failure.at}</summary><pre>{failure.message}</pre><button className="button secondary" onClick={() => void navigator.clipboard.writeText(`${failure.step}\n${failure.message}`).then(() => setNotice('错误详情已复制。')).catch(() => setNotice('无法复制，请手动选择错误详情。'))}><Copy size={14}/>复制错误详情</button></details><small>可修改 Key、来源或筛选后重试；当前壁纸会保留。</small></section>}
        {page === 'home' ? <div className="home-flow">{keyPanel()}<section className="settings-panel source-panel"><div className="panel-heading"><span className="step-number">2</span><div><h2>从哪里寻找风景？</h2><p>选择一个来源，直接开始。在线照片按需获取。</p></div></div><div className="source-choices">{['search', 'author', 'collection', 'favorites', 'library'].map(kind => <button disabled={busy} key={kind} className={draft.kind === kind || kind === 'search' && ['topic', 'discover'].includes(draft.kind) ? 'chosen' : ''} onClick={() => setDraft({ kind, value: kind === 'search' ? 'mountains' : '', name: kind === 'search' ? '山野' : '' })}>{kind === 'favorites' ? <Heart size={18}/> : kind === 'library' ? <FolderOpen size={18}/> : kind === 'collection' ? <Image size={18}/> : kind === 'author' ? <Aperture size={18}/> : <Monitor size={18}/>}<strong>{labels[kind]}</strong><small>{kind === 'search' ? '山野、森林、海洋' : kind === 'author' ? '整个作者的作品' : kind === 'collection' ? 'Unsplash 公开合集' : kind === 'favorites' ? `${state.favorites.length} 张自己精选` : '电脑里的照片'}</small></button>)}</div>
          {['search', 'topic', 'discover'].includes(draft.kind) ? <div className="category-choice"><div className="category-tabs">{tags.map(tag => <button key={tag} className={(draft.kind === 'discover' && tag === '全部') || draft.name === tag ? 'selected' : ''} onClick={() => setDraft(tag === '全部' ? { kind: 'discover', value: '', name: '全部照片' } : { kind: 'search', value: keywords[tag], name: tag })}>{tag}</button>)}</div><div className="setting-grid"><label>分类方式<select value={draft.kind} onChange={e => setDraft({ kind: e.target.value, value: '', name: '' })}><option value="search">关键词分类</option><option value="topic">Unsplash 官方主题</option><option value="discover">全部公开照片</option></select></label>{draft.kind !== 'discover' && <label>{draft.kind === 'topic' ? '主题名称或链接' : '也可输入自己的关键词'}<input aria-label="来源内容" value={draft.value} onChange={e => setDraft(s => ({ ...s, value: e.target.value, name: '' }))} placeholder={draft.kind === 'topic' ? 'nature 或 https://unsplash.com/t/nature' : '例如 forest、ocean'}/></label>}</div></div> : local ? <div className="local-source-note"><p>{draft.kind === 'favorites' ? '收藏构成你自己的照片集合。先浏览一个在线来源，点击照片上的爱心，再用收藏换壁纸。' : '导入照片或文件夹，随机使用其中符合方向与分辨率的照片。原图不会被修改。'}</p><button className="button secondary" onClick={() => draft.kind === 'library' ? void importPhotos() : setPage('favorites')}>{draft.kind === 'library' ? '导入照片 / 文件夹' : '查看我的收藏'}<ArrowRight size={15}/></button></div> : <label className="source-value-label">{draft.kind === 'author' ? '作者用户名或主页链接' : 'Collection ID 或合集链接'}<input aria-label="来源内容" value={draft.value} onChange={e => setDraft(s => ({ ...s, value: e.target.value, name: '' }))} placeholder={draft.kind === 'author' ? '例如 @anniespratt 或 https://unsplash.com/@你的用户名' : 'https://unsplash.com/collections/…'}/><small>{draft.kind === 'author' ? '自动从这个作者全部公开作品中随机选图。' : 'Collection 是 Unsplash 网站上的照片合集，粘贴它的链接即可。'}</small></label>}
          {!!savedSources.length && !local && <div className="online-shortcuts"><small>最近使用</small>{savedSources.map(s => <button key={`${s.kind}-${s.value}`} onClick={() => setDraft(s)}>{s.name || s.value}</button>)}</div>}
          {filterControls(true)}<div className="source-start"><div><strong>{local ? '仅使用符合筛选的照片' : '从整个来源随机，只下载选中的一张'}</strong><small>更改来源或筛选后，点击开始即可生效。</small></div><button className="button secondary" disabled={busy} onClick={() => browse()}>浏览并收藏</button><button className="button primary" disabled={busy || !initialized} onClick={() => void start()}>{busy ? <LoaderCircle className="spin" size={16}/> : <Play size={16}/>}开始换壁纸</button></div></section>{current && <section className="home-current"><img src={current.thumb} alt={current.title}/><div><span className="eyebrow">ON YOUR DESKTOP</span><h2>{current.title}</h2><p>{current.author} · {activeSource}</p><button className="button secondary" onClick={() => void favorite(current)}><Heart size={16} fill={state.favorites.includes(current.id) ? 'currentColor' : 'none'}/>{state.favorites.includes(current.id) ? '已收藏' : '收藏当前照片'}</button></div></section>}</div>
        : page === 'settings' ? <section className="settings-page"><UpdatePanel/>{keyPanel()}<div className="settings-panel"><div className="panel-heading"><Monitor size={22}/><div><h2>桌面与存储</h2><p>来源、方向与轮换间隔统一在首页设置。</p></div></div><div className="setting-grid"><label>壁纸布局<select value={state.settings.fit} disabled={busy} onChange={e => void changeSettings({ fit: e.target.value })}><option value="fill">填充屏幕</option><option value="fit">适应屏幕</option><option value="stretch">拉伸</option><option value="center">居中</option></select></label><label>下载分辨率<select value={state.settings.quality} disabled={busy} onChange={e => void changeSettings({ quality: e.target.value })}><option value="1920">1920 px</option><option value="2560">2560 px</option><option value="3840">3840 px</option></select></label><label>缓存上限<select value={state.settings.cacheLimit} disabled={busy} onChange={e => void changeSettings({ cacheLimit: Number(e.target.value) })}>{[256, 512, 1024, 2048].map(v => <option key={v} value={v}>{v} MB</option>)}</select></label></div>{[{ field: 'autostart', title: '开机启动' }, { field: 'minimizeToTray', title: '关闭窗口后留在托盘' }].map(({ field, title }) => <div className="setting-row" key={field}><strong>{title}</strong><button className={`toggle ${state.settings[field as keyof Settings] ? 'on' : ''}`} aria-label={title} aria-pressed={!!state.settings[field as keyof Settings]} disabled={busy} onClick={() => void changeSettings({ [field]: !state.settings[field as keyof Settings] })}><span/></button></div>)}<div className="setting-row"><div><strong>图片缓存</strong><small>{(cache.bytes / 1048576).toFixed(1)} MB · 清理时保留当前壁纸</small></div><button className="button secondary" disabled={busy} onClick={() => { if (desktop()) void action('清理缓存', async () => { setCache(await api!.clearCache()); setNotice('缓存已清理。'); }); }}>清理缓存</button></div><p className="helper">macOS 使用系统布局；暂不支持多屏独立壁纸、锁屏及视频壁纸。</p><details className="api-note"><summary>Unsplash API 使用说明</summary><p>官方 API Guidelines 对壁纸应用用途有限制。公开发行前需确认许可。</p><button className="text-button" onClick={() => link('https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines')}>查看官方说明 <ExternalLink size={12}/></button></details></div></section>
        : <><div className="gallery-heading"><div><h2>{page === 'browse' ? '浏览与收藏' : '照片集合'}<span>{photos.length}</span></h2><p>{preview ? '界面示例照片 · 尚未连接真实来源' : '点爱心加入我的收藏，点击照片可预览与设置壁纸。'}</p></div><div className="gallery-buttons">{page === 'library' && <button className="button secondary" onClick={() => void importPhotos()}><FolderOpen size={15}/>导入照片</button>}<button className="button primary" disabled={busy} onClick={() => void start(page === 'browse' ? browseSource : { kind: page, value: '', name: labels[page] })}><Shuffle size={15}/>{page === 'browse' ? '随机使用整个来源' : '用这个集合换壁纸'}</button></div></div>{filterControls()}<div className="photo-grid">{photos.map((p, i) => <article className="photo-card" key={p.id}><button className="photo-image" style={{ backgroundColor: p.color }} aria-label={`预览 ${p.title}`} onClick={() => setSelected(p)}><img src={p.thumb} alt={p.title} loading={i < 4 ? 'eager' : 'lazy'}/><span className="image-badge">{p.width} × {p.height}</span><span className="photo-hover">查看大图 <ArrowRight size={14}/></span></button><button className={`favorite-btn ${state.favorites.includes(p.id) ? 'liked' : ''}`} aria-label={`${state.favorites.includes(p.id) ? '取消收藏' : '收藏'} ${p.title}`} onClick={() => void favorite(p)}><Heart size={17} fill={state.favorites.includes(p.id) ? 'currentColor' : 'none'}/></button><div className="photo-meta"><div><h3>{p.title}</h3><p>{p.author}</p></div></div></article>)}{loading && !photos.length && Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton"><div/><span/><small/></div>)}</div>{!loading && !photos.length && <div className="empty-state"><Image size={37}/><h3>{page === 'favorites' ? '收藏你喜欢的第一张照片' : '还没有符合条件的照片'}</h3><p>{page === 'favorites' ? '回首页选一个分类或作者，浏览时点击爱心即可收藏。' : '试试放宽方向或最低宽度，或继续加载照片。'}</p><button className="button secondary" onClick={() => page === 'favorites' ? setPage('home') : setFilters(s => ({ ...s, orientation: 'all', minWidth: 0 }))}>{page === 'favorites' ? '去选照片来源' : '取消照片筛选'}</button></div>}{hasMore && <div className="load-more"><button className="button secondary" disabled={loading} onClick={() => void loadMore()}>{loading ? '加载中…' : '加载更多照片'}</button></div>}</>}
      </div><footer className="wallpaper-bar"><div className="current-photo">{current ? <img src={current.thumb} alt="当前壁纸"/> : <div className="current-placeholder"><Monitor size={20}/></div>}<div><small>{current ? `当前来源 · ${activeSource}` : '还没有壁纸'}</small><strong>{current ? current.title : '在首页连接并选择照片来源'}</strong></div></div><div className="rotation-status"><span className={state.settings.rotation ? 'live-dot' : 'paused-dot'}/>{state.settings.rotation ? `每 ${state.settings.interval % 60 !== 0 ? `${state.settings.interval} 分钟` : `${state.settings.interval / 60} 小时`}换图` : '已暂停'}</div><div className="bar-actions"><button className="icon-btn" title={state.settings.rotation ? '暂停换图' : '继续换图'} disabled={busy || !state.current} onClick={() => void changeSettings({ rotation: !state.settings.rotation })}>{state.settings.rotation ? <Pause size={17}/> : <Play size={17}/>}</button><button className="button primary" disabled={busy} onClick={() => state.current ? void next() : setPage('home')}>{busy ? <LoaderCircle className="spin" size={16}/> : <Shuffle size={16}/>} {state.current ? '下一张' : '选择来源'}</button></div></footer>
    </main><input type="file" multiple accept="image/*" className="hidden" ref={inputFile} onChange={e => void webImport(e.target.files)}/>
    {selected && <div className="overlay" onClick={() => setSelected(null)}><section className="preview-dialog" role="dialog" aria-modal="true" aria-label="照片预览" onClick={e => e.stopPropagation()}><button className="preview-close" title="关闭预览" onClick={() => setSelected(null)}><X size={20}/></button><div className="preview-image"><img src={selected.full} alt={selected.title}/></div><div className="preview-info"><div className="eyebrow">A MOMENT WORTH KEEPING</div><h2>{selected.title}</h2><button className="author-link" onClick={() => link(selected.authorUrl || selected.link)}>{selected.author} {selected.link && <ExternalLink size={13}/>}</button><div className="photo-specs"><span>{selected.width} × {selected.height}</span><span>{selected.source === 'local' ? '本地照片' : selected.source === 'demo' ? '界面示例' : 'Unsplash'}</span></div><button className="button primary full-width" disabled={busy || selected.source === 'demo'} onClick={() => { if (desktop()) void action('设置这张照片为壁纸', async () => { setState(await api!.wallpaper({ id: selected.id })); setSelected(null); setNotice('壁纸已设置。'); }); }}><Monitor size={17}/>设为桌面壁纸</button><div className="preview-actions"><button className="button secondary" disabled={busy || selected.source === 'demo'} onClick={() => void favorite(selected)}><Heart size={16}/>{state.favorites.includes(selected.id) ? '已收藏' : '加入我的收藏'}</button><button className="button secondary" disabled={busy || selected.source === 'demo'} onClick={() => { if (desktop()) void action('下载照片', async () => { const r = await api!.download({ id: selected.id }); if (!r.canceled) setNotice('照片已保存。'); }); }}><ArrowDownToLine size={16}/>下载</button></div><p className="helper">收藏的照片可以在首页选择「我的收藏」，组成自己的壁纸集合。</p><div className="preview-credit">{selected.link && <button onClick={() => link(selected.link)}>查看 Unsplash 来源 <ExternalLink size={12}/></button>}</div></div></section></div>}
    {notice && <div className="toast" role="status"><span>{notice}</span><button title="关闭提示" onClick={() => setNotice('')}><X size={16}/></button></div>}
  </div>;
}
