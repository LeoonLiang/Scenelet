import { ArrowDownToLine, ExternalLink, Heart, Monitor, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Photo } from '../types';
import { t } from '../i18n';
import PhotoImage from './PhotoImage';
import { kindLabel } from '../lib/sources';

type Props = {
  screen?: { width: number; height: number }; fit: string; credit?: boolean;
  onPrevious?: () => void; onNext?: () => void; onRemove?: () => void; onRelink?: () => void;
  photo: Photo; liked: boolean; busy: boolean;
  onClose: () => void; onSetWallpaper: () => void; onFavorite: () => void; onDownload: () => void; onLink: (url?: string) => void;
};

export default function PreviewDialog({ photo, liked, busy, onClose, onSetWallpaper, onFavorite, onDownload, onLink, screen, fit, credit = false, onPrevious, onNext, onRemove, onRelink }: Props) {
  const demo = photo.source === 'demo';
  const [crop, setCrop] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const navigation = useRef({ onPrevious, onNext, busy });
  navigation.current = { onPrevious, onNext, busy };
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; close.current?.focus();
    const background = document.querySelector('main'); const sidebar = document.querySelector('aside');
    background?.setAttribute('inert', ''); sidebar?.setAttribute('inert', '');
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) && !navigation.current.busy) {
        if (event.key === 'ArrowLeft') { event.preventDefault(); navigation.current.onPrevious?.(); }
        if (event.key === 'ArrowRight') { event.preventDefault(); navigation.current.onNext?.(); }
      }
      if (event.key !== 'Tab') return;
      const nodes = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]') || [])].filter(node => node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = oldOverflow; background?.removeAttribute('inert'); sidebar?.removeAttribute('inert'); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="overlay" onClick={onClose}>
    <section ref={dialog} className="preview-dialog" role="dialog" aria-modal="true" aria-label={t('preview.label')} onClick={e => e.stopPropagation()}>
      <div className="preview-image">
        <div className={crop && screen ? 'desktop-crop' : 'original-preview'} style={crop && screen ? { aspectRatio: `${screen.width}/${screen.height}`, width: `min(100cqw, ${screen.width / screen.height * 100}cqh)` } : undefined}>
          <PhotoImage key={photo.id} src={photo.full} alt={photo.title} style={{ objectFit: crop ? fit === 'fill' ? 'cover' : fit === 'stretch' ? 'fill' : fit === 'center' ? 'none' : 'contain' : 'contain', ...(crop && fit === 'center' && screen ? { objectFit: 'contain' as const, width: `${photo.width / screen.width * 100}%`, height: `${photo.height / screen.height * 100}%`, maxWidth: 'none', flexShrink: 0 } : {}) }}/>
          {crop && screen && credit && photo.source === 'unsplash' && photo.author && <span className="credit-mark" aria-hidden="true">{t('credit.unsplash', { author: photo.author })}</span>}
        </div>
      </div>
      <div className="preview-info">
        <button ref={close} className="icon-btn preview-close" aria-label={t('preview.close')} onClick={onClose}><X size={18}/></button>
        <div className="preview-navigation">
          <button className="button secondary" disabled={busy || !onPrevious} onClick={onPrevious} aria-label={t('preview.previous')}>←</button>
          <button className="button secondary" disabled={busy || !onNext} onClick={onNext} aria-label={t('preview.next')}>→</button>
        </div>
        <h2>{photo.title}</h2>
        <button className="author-link" onClick={() => onLink(photo.authorUrl || photo.link)}>{photo.author}{photo.link && <ExternalLink size={12}/>}</button>
        <dl className="photo-specs">
          <div><dt>{t('preview.size')}</dt><dd>{photo.width} × {photo.height}</dd></div>
          <div><dt>{t('preview.source')}</dt><dd>{photo.source === 'local' ? kindLabel('library') : demo ? t('preview.sample') : 'Unsplash'}</dd></div>
        </dl>
        {screen && <><button className="button secondary" aria-pressed={crop} onClick={() => setCrop(value => !value)}>{t(crop ? 'preview.original' : 'preview.desktop')}</button><p className="helper">{t('preview.cropHint')}</p></>}
        <button className="button primary full-width" disabled={busy || demo} onClick={onSetWallpaper}><Monitor size={16}/>{t('preview.set')}</button>
        <div className="preview-actions">
          <button className={`button secondary${liked ? ' is-liked' : ''}`} disabled={busy || demo} onClick={onFavorite}><Heart size={15} fill={liked ? 'currentColor' : 'none'}/>{t(liked ? 'photo.favorited' : 'photo.favorite')}</button>
          <button className="button secondary" disabled={busy || demo} onClick={onDownload}><ArrowDownToLine size={15}/>{t('preview.download')}</button>
        </div>
        <p className="helper">{t('preview.help')}</p>
        {photo.source === 'local' && <div className="library-actions">
          {photo.missing && <p role="status">{t('library.missing')}</p>}
          {onRelink && <button className="button secondary" disabled={busy} onClick={onRelink}>{t('library.relink')}</button>}
          {onRemove && <button className="button secondary" disabled={busy} onClick={onRemove}>{t('library.remove')}</button>}
          <p className="helper">{t('library.removeHelp')}</p>
        </div>}
        {photo.link && <button className="text-button preview-credit" onClick={() => onLink(photo.link)}>{t('preview.viewOnUnsplash')} <ExternalLink size={12}/></button>}
      </div>
    </section>
  </div>;
}
