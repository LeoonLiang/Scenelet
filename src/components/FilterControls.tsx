import type { Dispatch, SetStateAction } from 'react';
import type { Settings } from '../types';
import { intervalLabel, intervals } from '../lib/sources';

export type IntervalState = { custom: boolean; setCustom: (v: boolean) => void; minutes: string; setMinutes: (v: string) => void };
type Props = { filters: Settings; setFilters: Dispatch<SetStateAction<Settings>>; busy: boolean; interval?: IntervalState; className?: string };

export default function FilterControls({ filters, setFilters, busy, interval, className = '' }: Props) {
  return <div className={`filter-grid ${className}`}>
    <label className="field">
      <span>照片方向</span>
      <select disabled={busy} value={filters.orientation} onChange={e => setFilters(s => ({ ...s, orientation: e.target.value }))}>
        <option value="landscape">仅横屏</option><option value="portrait">仅竖屏</option><option value="squarish">仅方形</option><option value="all">所有方向</option>
      </select>
    </label>
    <label className="field">
      <span>最低原图宽度</span>
      <select disabled={busy} value={filters.minWidth} onChange={e => setFilters(s => ({ ...s, minWidth: Number(e.target.value) }))}>
        <option value={0}>不限制</option><option value={1920}>1920 px</option><option value={2560}>2560 px</option><option value={3840}>3840 px</option>
      </select>
    </label>
    {interval && <label className="field">
      <span>自动换图间隔</span>
      <select disabled={busy} value={interval.custom ? 'custom' : filters.interval} onChange={e => { interval.setCustom(e.target.value === 'custom'); if (e.target.value !== 'custom') setFilters(s => ({ ...s, interval: Number(e.target.value) })); }}>
        {intervals.map(v => <option key={v} value={v}>{intervalLabel(v)}</option>)}
        <option value="custom">自定义…</option>
      </select>
    </label>}
    {interval?.custom && <label className="field custom-interval">
      <span>自定义间隔（分钟）</span>
      <input type="number" min="1" max="10080" step="1" disabled={busy} value={interval.minutes} onChange={e => interval.setMinutes(e.target.value)} aria-describedby="custom-interval-help"/>
      <small id="custom-interval-help">1 到 10080 分钟，点开始后生效</small>
    </label>}
  </div>;
}
