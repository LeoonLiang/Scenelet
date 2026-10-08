import { Heart } from 'lucide-react';
import type { Photo } from '../types';

type Props = { photo: Photo; source: string; liked: boolean; onFavorite: () => void; onOpen: () => void };

export default function NowShowing({ photo, source, liked, onFavorite, onOpen }: Props) {
  return <section className="now-showing" aria-label="当前壁纸">
    <button className="now-image" style={{ backgroundColor: photo.color }} onClick={onOpen} aria-label={`预览 ${photo.title}`}>
      <img src={photo.full} alt={photo.title}/>
    </button>
    <div className="now-caption">
      <div>
        <h2>{photo.title}</h2>
        <p>{photo.author}，来自{source}</p>
      </div>
      <button className={`button secondary${liked ? ' is-liked' : ''}`} onClick={onFavorite}><Heart size={15} fill={liked ? 'currentColor' : 'none'}/>{liked ? '已收藏' : '收藏'}</button>
    </div>
  </section>;
}
