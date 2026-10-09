import { Download, ExternalLink, Heart, RefreshCw, Shuffle, Settings2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Photo, PhotoBatchState } from '../types';
import { t } from '../i18n';
import PhotoImage from './PhotoImage';
import DesktopPreview from './DesktopPreview';
import type { DisplaySize } from '../lib/display-preview';

type Props = {
  batch: PhotoBatchState | null; loading: boolean; busy: boolean; source: string; favorites: string[];
  onSelect: (id?: string) => void; onRefresh: () => void; onApply: (photo: Photo) => void;
  onFavorite: (photo: Photo) => void; onDownload: (photo: Photo) => void;
  onLink: (url?: string) => void; onSource: () => void; compact?: boolean;
  screen?: DisplaySize; fit: string; platform?: string; wallpaperWidth?: number;
};
export default function PhotoBatch({ batch, loading, busy, source, favorites, onSelect, onRefresh, onApply, onFavorite, onDownload, onLink, onSource, compact, screen, fit, platform, wallpaperWidth }: Props) {
  const photo = batch?.photos.find(p => p.id === batch.selectedId);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => { strip.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [batch?.selectedId]);
  const disabled = busy || loading;
  return <section className={`photo-batch ${compact ? 'compact' : 'panel'}`} aria-label={t('batch.title')} aria-busy={loading}>
    <header className="batch-header"><div><span>{t('batch.title')}</span><strong>{source}</strong></div><button className="icon-btn" title={t('batch.changeSource')} aria-label={t('batch.changeSource')} onClick={onSource}><Settings2 size={17}/></button></header>
    {photo ? <>
      <div className={`batch-preview ${compact ? '' : 'batch-desktop-preview'}`}>
        {compact ? <PhotoImage src={photo.full} alt={photo.title}/> : <DesktopPreview photo={photo} screen={screen} fit={fit} platform={platform} wallpaperWidth={wallpaperWidth}/>}
        <button className={`batch-heart ${favorites.includes(photo.id) ? 'liked' : ''}`} disabled={disabled || photo.source === 'demo'} aria-label={t(favorites.includes(photo.id) ? 'photo.favorited' : 'photo.favorite')} onClick={() => onFavorite(photo)}><Heart size={22} fill={favorites.includes(photo.id) ? 'currentColor' : 'none'}/></button>
        <div className="batch-credit"><strong>{photo.title}</strong><span><button disabled={!photo.authorUrl} onClick={() => onLink(photo.authorUrl)}>{photo.author}</button>{photo.source === 'unsplash' && <> · <button onClick={() => onLink(photo.link)}>Unsplash <ExternalLink size={11}/></button></>}</span></div>
      </div>
      <div className="batch-thumbnails" ref={strip} aria-label={t('batch.candidates')}>
        {batch!.photos.map((p, i) => <button className="batch-thumb" key={p.id} data-photo-id={p.id} aria-label={`${i + 1}. ${p.title}`} aria-pressed={p.id === photo.id} disabled={disabled} onClick={() => onSelect(p.id)}><img src={p.thumb} alt=""/><span>{i + 1}</span></button>)}
      </div>
    </> : <div className="batch-empty" role="status"><span>{t(loading ? 'gallery.loading' : 'batch.empty')}</span>{!loading && <button className="text-button" onClick={onSource}>{t('batch.changeSource')}</button>}</div>}
    <footer className="batch-actions">
      <button className="icon-btn" title={t('preview.download')} aria-label={t('preview.download')} disabled={disabled || !photo || photo.source === 'demo'} onClick={() => photo && onDownload(photo)}><Download size={18}/></button>
      <button className="button secondary batch-refresh" disabled={disabled} onClick={onRefresh}><RefreshCw size={15} className={loading ? 'spin' : ''}/>{t('batch.refresh')}</button>
      <button className="button secondary batch-random" disabled={disabled || !photo} onClick={() => onSelect()}><Shuffle size={15}/>{t('batch.random')}</button>
      <button className="button primary batch-apply" disabled={disabled || !photo || photo.source === 'demo'} onClick={() => photo && onApply(photo)}>{t('batch.apply')}</button>
    </footer>
    {!compact && <p className="batch-hint">{t('batch.hint')}</p>}
  </section>;
}
