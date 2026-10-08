import { Heart } from 'lucide-react';
import type { Photo } from '../types';
import { t } from '../i18n';

type Props = { photo: Photo; source: string; liked: boolean; onFavorite: () => void; onOpen: () => void };

export default function NowShowing({ photo, source, liked, onFavorite, onOpen }: Props) {
  return <section className="now-showing" aria-label={t('now.label')}>
    <button className="now-image" style={{ backgroundColor: photo.color }} onClick={onOpen} aria-label={t('photo.preview', { title: photo.title })}>
      <img src={photo.full} alt={photo.title}/>
    </button>
    <div className="now-caption">
      <div>
        <h2>{photo.title}</h2>
        <p>{t('now.from', { author: photo.author, source })}</p>
      </div>
      <button className={`button secondary${liked ? ' is-liked' : ''}`} onClick={onFavorite}><Heart size={15} fill={liked ? 'currentColor' : 'none'}/>{t(liked ? 'photo.favorited' : 'photo.favorite')}</button>
    </div>
  </section>;
}
