import { ArrowDownToLine, ExternalLink, Heart, Monitor, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Photo } from '../types';
import { t } from '../i18n';
import { kindLabel } from '../lib/sources';

type Props = {
  photo: Photo; liked: boolean; busy: boolean;
  onClose: () => void; onSetWallpaper: () => void; onFavorite: () => void; onDownload: () => void; onLink: (url?: string) => void;
};

export default function PreviewDialog({ photo, liked, busy, onClose, onSetWallpaper, onFavorite, onDownload, onLink }: Props) {
  const demo = photo.source === 'demo';
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; close.current?.focus(); return () => previous?.focus(); }, []);
  return <div className="overlay" onClick={onClose}>
    <section className="preview-dialog" role="dialog" aria-modal="true" aria-label={t('preview.label')} onClick={e => e.stopPropagation()}>
      <div className="preview-image"><img src={photo.full} alt={photo.title}/></div>
      <div className="preview-info">
        <button ref={close} className="icon-btn preview-close" aria-label={t('preview.close')} onClick={onClose}><X size={18}/></button>
        <h2>{photo.title}</h2>
        <button className="author-link" onClick={() => onLink(photo.authorUrl || photo.link)}>{photo.author}{photo.link && <ExternalLink size={12}/>}</button>
        <dl className="photo-specs">
          <div><dt>{t('preview.size')}</dt><dd>{photo.width} × {photo.height}</dd></div>
          <div><dt>{t('preview.source')}</dt><dd>{photo.source === 'local' ? kindLabel('library') : demo ? t('preview.sample') : 'Unsplash'}</dd></div>
        </dl>
        <button className="button primary full-width" disabled={busy || demo} onClick={onSetWallpaper}><Monitor size={16}/>{t('preview.set')}</button>
        <div className="preview-actions">
          <button className={`button secondary${liked ? ' is-liked' : ''}`} disabled={busy || demo} onClick={onFavorite}><Heart size={15} fill={liked ? 'currentColor' : 'none'}/>{t(liked ? 'photo.favorited' : 'photo.favorite')}</button>
          <button className="button secondary" disabled={busy || demo} onClick={onDownload}><ArrowDownToLine size={15}/>{t('preview.download')}</button>
        </div>
        <p className="helper">{t('preview.help')}</p>
        {photo.link && <button className="text-button preview-credit" onClick={() => onLink(photo.link)}>{t('preview.viewOnUnsplash')} <ExternalLink size={12}/></button>}
      </div>
    </section>
  </div>;
}
