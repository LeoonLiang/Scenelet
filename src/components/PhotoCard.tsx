import { Heart } from 'lucide-react';
import type { Photo } from '../types';
import { t } from '../i18n';

type Props = { photo: Photo; liked: boolean; eager: boolean; onOpen: () => void; onFavorite: () => void };

export default function PhotoCard({ photo, liked, eager, onOpen, onFavorite }: Props) {
  return <article className="photo-card">
    <button className="photo-image" style={{ backgroundColor: photo.color }} aria-label={t('photo.preview', { title: photo.title })} onClick={onOpen}>
      <img src={photo.thumb} alt={photo.title} loading={eager ? 'eager' : 'lazy'}/>
    </button>
    <button className={`favorite-btn${liked ? ' liked' : ''}`} aria-label={liked ? t('photo.removeFavorite', { title: photo.title }) : t('photo.addFavorite', { title: photo.title })} aria-pressed={liked} onClick={onFavorite}>
      <Heart size={15} fill={liked ? 'currentColor' : 'none'}/>
    </button>
    <div className="photo-meta">
      <h3>{photo.title}</h3>
      <p>{photo.author}</p>
    </div>
  </article>;
}
