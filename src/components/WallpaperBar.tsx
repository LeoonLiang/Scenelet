import { LoaderCircle, Monitor, Pause, Play, Shuffle } from 'lucide-react';
import type { Photo } from '../types';
import { intervalLabel } from '../lib/sources';

type Props = {
  current?: Photo; hasCurrent: boolean; source: string; changing: string; busy: boolean;
  rotation: boolean; interval: number;
  onToggleRotation: () => void; onNext: () => void; onChooseSource: () => void;
};

export default function WallpaperBar({ current, hasCurrent, source, changing, busy, rotation, interval, onToggleRotation, onNext, onChooseSource }: Props) {
  const every = intervalLabel(interval);
  return <footer className="wallpaper-bar">
    <div className="current-photo">
      {current ? <img src={current.thumb} alt="当前壁纸"/> : <div className="current-placeholder"><Monitor size={18} strokeWidth={1.75}/></div>}
      <div>
        <strong>{current ? current.title : '还没有壁纸'}</strong>
        <small aria-live="polite">{changing || (current ? source : '在换壁纸页选择照片来源')}</small>
      </div>
    </div>
    <div className="bar-actions">
      <span className="rotation-status">{rotation ? every === '每天' ? '每天换一张' : `每 ${every}换一张` : '自动换图已暂停'}</span>
      <button className="icon-btn" aria-label={rotation ? '暂停换图' : '继续换图'} title={rotation ? '暂停换图' : '继续换图'} disabled={busy || !hasCurrent} onClick={onToggleRotation}>{rotation ? <Pause size={16}/> : <Play size={16}/>}</button>
      <button className="button primary" disabled={busy || !!changing} onClick={hasCurrent ? onNext : onChooseSource}>{busy || changing ? <LoaderCircle className="spin" size={15}/> : <Shuffle size={15}/>}{changing ? '换图中' : hasCurrent ? '下一张' : '选择来源'}</button>
    </div>
  </footer>;
}
