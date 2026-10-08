import { LoaderCircle, Monitor, Pause, Play, Shuffle } from 'lucide-react';
import type { Photo } from '../types';
import { intervalLabel } from '../lib/sources';
import { t } from '../i18n';

type Props = {
  current?: Photo; hasCurrent: boolean; source: string; changing: string; busy: boolean;
  rotation: boolean; interval: number;
  nextRotationAt?: number | null; canPrevious: boolean; onPrevious: () => void;
  onToggleRotation: () => void; onNext: () => void; onChooseSource: () => void;
};

export default function WallpaperBar({ current, hasCurrent, source, changing, busy, rotation, interval, onToggleRotation, onNext, onChooseSource, nextRotationAt, canPrevious, onPrevious }: Props) {
  const every = intervalLabel(interval);
  return <footer className="wallpaper-bar">
    <div className="current-photo">
      {current ? <img src={current.thumb} alt={t('now.label')}/> : <div className="current-placeholder"><Monitor size={18} strokeWidth={1.75}/></div>}
      <div>
        <strong>{current ? current.title : t('bar.none')}</strong>
        <small aria-live="polite">{changing || (current ? source : t('bar.chooseHint'))}</small>
      </div>
    </div>
    <div className="bar-actions">
      <span className="rotation-status">{rotation ? nextRotationAt ? t('bar.nextAt', { time: new Date(nextRotationAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }) : interval === 1440 ? t('bar.daily') : t('bar.every', { every }) : t('bar.paused')}</span>
      <button className="button secondary" disabled={busy || !!changing || !canPrevious} onClick={onPrevious}>{t('history.previous')}</button>
      <button className="icon-btn" aria-label={t(rotation ? 'bar.pause' : 'bar.resume')} title={t(rotation ? 'bar.pause' : 'bar.resume')} disabled={busy || !hasCurrent} onClick={onToggleRotation}>{rotation ? <Pause size={16}/> : <Play size={16}/>}</button>
      <button className="button primary" disabled={busy || !!changing} onClick={hasCurrent ? onNext : onChooseSource}>{busy || changing ? <LoaderCircle className="spin" size={15}/> : <Shuffle size={15}/>}{t(changing ? 'bar.changing' : hasCurrent ? 'bar.next' : 'home.chooseSource')}</button>
    </div>
  </footer>;
}
