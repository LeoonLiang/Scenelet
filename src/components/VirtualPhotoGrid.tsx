import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Photo } from '../types';
import PhotoCard from './PhotoCard';

type Props = { photos: Photo[]; favorites: string[]; onOpen: (p: Photo) => void; onFavorite: (p: Photo) => void };
export default function VirtualPhotoGrid({ photos, favorites, onOpen, onFavorite }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ width: 800, top: 0, height: 900 });
  useLayoutEffect(() => {
    const element = root.current!;
    let frame = 0;
    const update = () => { const rect = element.getBoundingClientRect(); setView({ width: rect.width, top: -rect.top, height: window.innerHeight }); };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule); observer.observe(element);
    window.addEventListener('scroll', schedule, { passive: true }); window.addEventListener('resize', schedule); update();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, []);
  const liked = useMemo(() => new Set(favorites), [favorites]);
  const columns = Math.max(1, Math.floor((view.width + 20) / 260));
  const rowHeight = ((view.width - (columns - 1) * 20) / columns) * 2 / 3 + 76;
  const rows = Math.ceil(photos.length / columns);
  const first = Math.max(0, Math.min(rows - 1, Math.floor(view.top / rowHeight) - 2));
  const last = Math.min(rows, Math.ceil((Math.max(0, view.top) + view.height) / rowHeight) + 2);
  return <div ref={root} className="virtual-grid" style={{ height: rows * rowHeight }}>
    {Array.from({ length: Math.max(0, last - first) }, (_, offset) => {
      const row = first + offset;
      return <div className="virtual-row" key={row} style={{ top: row * rowHeight, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {photos.slice(row * columns, (row + 1) * columns).map(p => <PhotoCard key={p.id} photo={p} eager liked={liked.has(p.id)} onOpen={() => onOpen(p)} onFavorite={() => onFavorite(p)}/>)}
      </div>;
    })}
  </div>;
}
