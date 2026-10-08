import { Aperture, ArrowRight, FolderOpen, Heart, Image, LoaderCircle, Mountain, Play } from 'lucide-react';
import type { ReactNode } from 'react';
import type { OnlineSource } from '../types';
import { tags } from '../data';
import { isLocalKind, kindLabel, sourceName } from '../lib/sources';
import { t, type MessageKey } from '../i18n';

type Props = {
  draft: OnlineSource; setDraft: (s: OnlineSource | ((s: OnlineSource) => OnlineSource)) => void;
  savedSources: OnlineSource[]; favorites: number; busy: boolean; initialized: boolean;
  filters: ReactNode; onBrowse: () => void; onStart: () => void; onImport: () => void; onOpenFavorites: () => void;
};

const kinds: { kind: string; Icon: typeof Mountain; hint?: MessageKey }[] = [
  { kind: 'search', Icon: Mountain, hint: 'source.hint.search' },
  { kind: 'author', Icon: Aperture, hint: 'source.hint.author' },
  { kind: 'collection', Icon: Image, hint: 'source.hint.collection' },
  { kind: 'favorites', Icon: Heart },
  { kind: 'library', Icon: FolderOpen, hint: 'source.hint.library' },
];

export default function SourcePanel({ draft, setDraft, savedSources, favorites, busy, initialized, filters, onBrowse, onStart, onImport, onOpenFavorites }: Props) {
  const local = isLocalKind(draft.kind);
  const category = ['search', 'topic', 'discover'].includes(draft.kind);
  return <section className="panel source-panel">
    <header className="panel-head">
      <h2>{t('source.title')}</h2>
      <p>{t('source.desc')}</p>
    </header>

    <div className="source-choices" role="radiogroup" aria-label={t('source.title')}>
      {kinds.map(({ kind, Icon, hint }) => {
        const chosen = draft.kind === kind || kind === 'search' && ['topic', 'discover'].includes(draft.kind);
        return <button key={kind} role="radio" aria-checked={chosen} disabled={busy} className={chosen ? 'chosen' : ''} onClick={() => setDraft({ kind, value: kind === 'search' ? 'mountains' : '', name: '' })}>
          <Icon size={18} strokeWidth={1.75}/>
          <strong>{kindLabel(kind)}</strong>
          <small>{kind === 'favorites' ? t('common.photos', { count: favorites }) : hint && t(hint)}</small>
        </button>;
      })}
    </div>

    {category ? <div className="source-detail">
      <div className="chips" role="group" aria-label={kindLabel('search')}>
        {tags.map(({ keyword, key }) => {
          const on = keyword ? draft.kind === 'search' && draft.value === keyword : draft.kind === 'discover';
          return <button key={key} className={on ? 'selected' : ''} aria-pressed={on} onClick={() => setDraft(keyword ? { kind: 'search', value: keyword, name: '' } : { kind: 'discover', value: '', name: '' })}>{t(key)}</button>;
        })}
      </div>
      <div className="filter-grid">
        <label className="field">
          <span>{t('source.mode')}</span>
          <select value={draft.kind} onChange={e => setDraft({ kind: e.target.value, value: '', name: '' })}>
            <option value="search">{t('source.mode.search')}</option><option value="topic">{t('source.mode.topic')}</option><option value="discover">{t('source.mode.discover')}</option>
          </select>
        </label>
        {draft.kind !== 'discover' && <label className="field wide">
          <span>{t(draft.kind === 'topic' ? 'source.topicField' : 'source.keywordField')}</span>
          <input value={draft.value} onChange={e => setDraft(s => ({ ...s, value: e.target.value, name: '' }))} placeholder={t(draft.kind === 'topic' ? 'source.topicPlaceholder' : 'source.keywordPlaceholder')}/>
        </label>}
      </div>
    </div>
    : local ? <div className="source-detail local-note">
      <p>{t(draft.kind === 'favorites' ? 'source.favoritesNote' : 'source.libraryNote')}</p>
      <button className="button secondary" onClick={() => draft.kind === 'library' ? onImport() : onOpenFavorites()}>{t(draft.kind === 'library' ? 'source.importAction' : 'source.viewFavorites')}<ArrowRight size={14}/></button>
    </div>
    : <label className="field source-detail">
      <span>{t(draft.kind === 'author' ? 'source.authorField' : 'source.collectionField')}</span>
      <input value={draft.value} onChange={e => setDraft(s => ({ ...s, value: e.target.value, name: '' }))} placeholder={draft.kind === 'author' ? t('source.authorPlaceholder') : 'https://unsplash.com/collections/…'} aria-describedby="source-help"/>
      <small id="source-help">{t(draft.kind === 'author' ? 'source.authorHelp' : 'source.collectionHelp')}</small>
    </label>}

    {!!savedSources.length && !local && <div className="recent">
      <span>{t('source.recent')}</span>
      {savedSources.map(s => <button key={`${s.kind}-${s.value}`} onClick={() => setDraft(s)}>{sourceName(s)}</button>)}
    </div>}

    {filters}

    <footer className="source-start">
      <p><strong>{t(local ? 'source.localHint' : 'source.onlineHint')}</strong>{t('source.applyNote')}</p>
      <button className="button secondary" disabled={busy} onClick={onBrowse}>{t('source.browse')}</button>
      <button className="button primary" disabled={busy || !initialized} onClick={onStart}>{busy ? <LoaderCircle className="spin" size={15}/> : <Play size={15}/>}{t('source.start')}</button>
    </footer>
  </section>;
}
