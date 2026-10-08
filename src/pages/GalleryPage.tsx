import { ImageOff } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Photo } from '../types';
import PhotoCard from '../components/PhotoCard';

type Props = {
  kind: 'browse' | 'favorites' | 'library';
  photos: Photo[]; favorites: string[]; loading: boolean; hasMore: boolean; demo: boolean;
  header: ReactNode; filters: ReactNode;
  onOpen: (p: Photo) => void; onFavorite: (p: Photo) => void; onLoadMore: () => void;
  onGoHome: () => void; onClearFilters: () => void;
};

export default function GalleryPage({ kind, photos, favorites, loading, hasMore, demo, header, filters, onOpen, onFavorite, onLoadMore, onGoHome, onClearFilters }: Props) {
  const emptyFavorites = kind === 'favorites';
  return <>
    {header}
    <div className="gallery-toolbar">
      <span className="count">{loading && !photos.length ? '正在加载' : `${photos.length} 张${demo ? '示例照片，连接 Unsplash 后显示真实来源' : ''}`}</span>
      {filters}
    </div>
    <div className="photo-grid" aria-busy={loading}>
      {photos.map((p, i) => <PhotoCard key={p.id} photo={p} eager={i < 4} liked={favorites.includes(p.id)} onOpen={() => onOpen(p)} onFavorite={() => onFavorite(p)}/>)}
      {loading && !photos.length && Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton" aria-hidden="true"><div/><span/><small/></div>)}
    </div>
    {!loading && !photos.length && <div className="empty-state">
      <ImageOff size={28} strokeWidth={1.5}/>
      <h3>{emptyFavorites ? '还没有收藏' : '没有符合筛选的照片'}</h3>
      <p>{emptyFavorites ? '去换壁纸页选一个分类或作者，浏览时点爱心收藏。' : '放宽方向或最低宽度试试，或者加载更多。'}</p>
      <button className="button secondary" onClick={emptyFavorites ? onGoHome : onClearFilters}>{emptyFavorites ? '去选照片来源' : '取消照片筛选'}</button>
    </div>}
    {hasMore && <div className="load-more"><button className="button secondary" disabled={loading} onClick={onLoadMore}>{loading ? '加载中…' : '加载更多照片'}</button></div>}
  </>;
}
