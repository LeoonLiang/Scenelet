import { Aperture, ArrowRight, FolderOpen, Heart, Image, LoaderCircle, Mountain, Play } from 'lucide-react';
import type { ReactNode } from 'react';
import type { OnlineSource } from '../types';
import { keywords, tags } from '../data';
import { isLocalKind, labels } from '../lib/sources';

type Props = {
  draft: OnlineSource; setDraft: (s: OnlineSource | ((s: OnlineSource) => OnlineSource)) => void;
  savedSources: OnlineSource[]; favorites: number; busy: boolean; initialized: boolean;
  filters: ReactNode; onBrowse: () => void; onStart: () => void; onImport: () => void; onOpenFavorites: () => void;
};

const kinds = [
  { kind: 'search', Icon: Mountain, hint: '山野、森林、海洋' },
  { kind: 'author', Icon: Aperture, hint: '某位作者的全部作品' },
  { kind: 'collection', Icon: Image, hint: 'Unsplash 公开合集' },
  { kind: 'favorites', Icon: Heart, hint: '' },
  { kind: 'library', Icon: FolderOpen, hint: '电脑里的照片' },
] as const;

export default function SourcePanel({ draft, setDraft, savedSources, favorites, busy, initialized, filters, onBrowse, onStart, onImport, onOpenFavorites }: Props) {
  const local = isLocalKind(draft.kind);
  const category = ['search', 'topic', 'discover'].includes(draft.kind);
  return <section className="panel source-panel">
    <header className="panel-head">
      <h2>照片来源</h2>
      <p>选一个来源。在线照片换到哪张才下载哪张。</p>
    </header>

    <div className="source-choices" role="radiogroup" aria-label="照片来源">
      {kinds.map(({ kind, Icon, hint }) => {
        const chosen = draft.kind === kind || kind === 'search' && ['topic', 'discover'].includes(draft.kind);
        return <button key={kind} role="radio" aria-checked={chosen} disabled={busy} className={chosen ? 'chosen' : ''} onClick={() => setDraft({ kind, value: kind === 'search' ? 'mountains' : '', name: kind === 'search' ? '山野' : '' })}>
          <Icon size={18} strokeWidth={1.75}/>
          <strong>{labels[kind]}</strong>
          <small>{kind === 'favorites' ? `${favorites} 张` : hint}</small>
        </button>;
      })}
    </div>

    {category ? <div className="source-detail">
      <div className="chips" role="group" aria-label="分类">
        {tags.map(tag => <button key={tag} className={(draft.kind === 'discover' && tag === '全部') || draft.name === tag ? 'selected' : ''} aria-pressed={(draft.kind === 'discover' && tag === '全部') || draft.name === tag} onClick={() => setDraft(tag === '全部' ? { kind: 'discover', value: '', name: '全部照片' } : { kind: 'search', value: keywords[tag], name: tag })}>{tag}</button>)}
      </div>
      <div className="filter-grid">
        <label className="field">
          <span>分类方式</span>
          <select value={draft.kind} onChange={e => setDraft({ kind: e.target.value, value: '', name: '' })}>
            <option value="search">关键词分类</option><option value="topic">Unsplash 官方主题</option><option value="discover">全部公开照片</option>
          </select>
        </label>
        {draft.kind !== 'discover' && <label className="field wide">
          <span>{draft.kind === 'topic' ? '主题名称或链接' : '自己的关键词（英文）'}</span>
          <input value={draft.value} onChange={e => setDraft(s => ({ ...s, value: e.target.value, name: '' }))} placeholder={draft.kind === 'topic' ? 'nature 或 https://unsplash.com/t/nature' : 'forest、ocean'}/>
        </label>}
      </div>
    </div>
    : local ? <div className="source-detail local-note">
      <p>{draft.kind === 'favorites' ? '先浏览一个在线来源，点照片上的爱心收藏，再用收藏换壁纸。' : '导入照片或文件夹，从中随机挑选符合方向和分辨率的照片。原图不会被修改。'}</p>
      <button className="button secondary" onClick={() => draft.kind === 'library' ? onImport() : onOpenFavorites()}>{draft.kind === 'library' ? '导入照片或文件夹' : '查看我的收藏'}<ArrowRight size={14}/></button>
    </div>
    : <label className="field source-detail">
      <span>{draft.kind === 'author' ? '作者用户名或主页链接' : 'Collection ID 或合集链接'}</span>
      <input value={draft.value} onChange={e => setDraft(s => ({ ...s, value: e.target.value, name: '' }))} placeholder={draft.kind === 'author' ? '@anniespratt 或 https://unsplash.com/@用户名' : 'https://unsplash.com/collections/…'} aria-describedby="source-help"/>
      <small id="source-help">{draft.kind === 'author' ? '从这位作者的全部公开作品里随机选图。' : 'Collection 是 Unsplash 网站上的照片合集，粘贴它的链接即可。'}</small>
    </label>}

    {!!savedSources.length && !local && <div className="recent">
      <span>最近使用</span>
      {savedSources.map(s => <button key={`${s.kind}-${s.value}`} onClick={() => setDraft(s)}>{s.name || s.value}</button>)}
    </div>}

    {filters}

    <footer className="source-start">
      <p><strong>{local ? '只使用符合筛选的照片' : '从整个来源随机，只下载选中的一张'}</strong>改了来源或筛选，点开始后生效。</p>
      <button className="button secondary" disabled={busy} onClick={onBrowse}>浏览并收藏</button>
      <button className="button primary" disabled={busy || !initialized} onClick={onStart}>{busy ? <LoaderCircle className="spin" size={15}/> : <Play size={15}/>}开始换壁纸</button>
    </footer>
  </section>;
}
