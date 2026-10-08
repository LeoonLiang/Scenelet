import { ArrowDownToLine, ExternalLink, Heart, Monitor, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Photo } from '../types';

type Props = {
  photo: Photo; liked: boolean; busy: boolean;
  onClose: () => void; onSetWallpaper: () => void; onFavorite: () => void; onDownload: () => void; onLink: (url?: string) => void;
};

export default function PreviewDialog({ photo, liked, busy, onClose, onSetWallpaper, onFavorite, onDownload, onLink }: Props) {
  const demo = photo.source === 'demo';
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; close.current?.focus(); return () => previous?.focus(); }, []);
  return <div className="overlay" onClick={onClose}>
    <section className="preview-dialog" role="dialog" aria-modal="true" aria-label="照片预览" onClick={e => e.stopPropagation()}>
      <div className="preview-image"><img src={photo.full} alt={photo.title}/></div>
      <div className="preview-info">
        <button ref={close} className="icon-btn preview-close" aria-label="关闭预览" onClick={onClose}><X size={18}/></button>
        <h2>{photo.title}</h2>
        <button className="author-link" onClick={() => onLink(photo.authorUrl || photo.link)}>{photo.author}{photo.link && <ExternalLink size={12}/>}</button>
        <dl className="photo-specs">
          <div><dt>尺寸</dt><dd>{photo.width} × {photo.height}</dd></div>
          <div><dt>来源</dt><dd>{photo.source === 'local' ? '本地照片' : demo ? '界面示例' : 'Unsplash'}</dd></div>
        </dl>
        <button className="button primary full-width" disabled={busy || demo} onClick={onSetWallpaper}><Monitor size={16}/>设为桌面壁纸</button>
        <div className="preview-actions">
          <button className={`button secondary${liked ? ' is-liked' : ''}`} disabled={busy || demo} onClick={onFavorite}><Heart size={15} fill={liked ? 'currentColor' : 'none'}/>{liked ? '已收藏' : '收藏'}</button>
          <button className="button secondary" disabled={busy || demo} onClick={onDownload}><ArrowDownToLine size={15}/>下载</button>
        </div>
        <p className="helper">收藏后，可以在换壁纸页选「我的收藏」作为来源。</p>
        {photo.link && <button className="text-button preview-credit" onClick={() => onLink(photo.link)}>在 Unsplash 查看 <ExternalLink size={12}/></button>}
      </div>
    </section>
  </div>;
}
