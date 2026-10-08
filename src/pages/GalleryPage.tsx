import { ImageOff } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Photo } from '../types';
import PhotoCard from '../components/PhotoCard';
import { t } from '../i18n';

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
      <span className="count">{loading && !photos.length ? t('gallery.loading') : t(demo ? 'gallery.demoCount' : 'common.photos', { count: photos.length })}</span>
      {filters}
    </div>
    <div className="photo-grid" aria-busy={loading}>
      {photos.map((p, i) => <PhotoCard key={p.id} photo={p} eager={i < 4} liked={favorites.includes(p.id)} onOpen={() => onOpen(p)} onFavorite={() => onFavorite(p)}/>)}
      {loading && !photos.length && Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton" aria-hidden="true"><div/><span/><small/></div>)}
    </div>
    {!loading && !photos.length && <div className="empty-state">
      <ImageOff size={28} strokeWidth={1.5}/>
      <h3>{t(emptyFavorites ? 'gallery.emptyFavoritesTitle' : 'gallery.emptyTitle')}</h3>
      <p>{t(emptyFavorites ? 'gallery.emptyFavoritesText' : 'gallery.emptyText')}</p>
      <button className="button secondary" onClick={emptyFavorites ? onGoHome : onClearFilters}>{t(emptyFavorites ? 'gallery.emptyFavoritesAction' : 'gallery.clearFilters')}</button>
    </div>}
    {hasMore && <div className="load-more"><button className="button secondary" disabled={loading} onClick={onLoadMore}>{t(loading ? 'gallery.loadingMore' : 'gallery.loadMore')}</button></div>}
  </>;
}
