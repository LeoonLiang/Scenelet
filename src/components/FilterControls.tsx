import type { Dispatch, SetStateAction } from 'react';
import type { Settings } from '../types';
import { intervalLabel, intervals } from '../lib/sources';
import { t } from '../i18n';

export type IntervalState = { custom: boolean; setCustom: (v: boolean) => void; minutes: string; setMinutes: (v: string) => void };
type Props = { filters: Settings; setFilters: Dispatch<SetStateAction<Settings>>; busy: boolean; interval?: IntervalState; className?: string };

export default function FilterControls({ filters, setFilters, busy, interval, className = '' }: Props) {
  return <div className={`filter-grid ${className}`}>
    <label className="field">
      <span>{t('filter.orientation')}</span>
      <select disabled={busy} value={filters.orientation} onChange={e => setFilters(s => ({ ...s, orientation: e.target.value }))}>
        {(['landscape', 'portrait', 'squarish', 'all'] as const).map(v => <option key={v} value={v}>{t(`filter.orientation.${v}`)}</option>)}
      </select>
    </label>
    <label className="field">
      <span>{t('filter.minWidth')}</span>
      <select disabled={busy} value={filters.minWidth} onChange={e => setFilters(s => ({ ...s, minWidth: Number(e.target.value) }))}>
        <option value={0}>{t('filter.minWidth.none')}</option><option value={1920}>1920 px</option><option value={2560}>2560 px</option><option value={3840}>3840 px</option>
      </select>
    </label>
    {interval && <label className="field">
      <span>{t('filter.interval')}</span>
      <select disabled={busy} value={interval.custom ? 'custom' : filters.interval} onChange={e => { interval.setCustom(e.target.value === 'custom'); if (e.target.value !== 'custom') setFilters(s => ({ ...s, interval: Number(e.target.value) })); }}>
        {intervals.map(v => <option key={v} value={v}>{intervalLabel(v)}</option>)}
        <option value="custom">{t('filter.custom')}</option>
      </select>
    </label>}
    {interval?.custom && <label className="field custom-interval">
      <span>{t('filter.customLabel')}</span>
      <input type="number" min="1" max="10080" step="1" disabled={busy} value={interval.minutes} onChange={e => interval.setMinutes(e.target.value)} aria-describedby="custom-interval-help"/>
      <small id="custom-interval-help">{t('filter.customHelp')}</small>
    </label>}
  </div>;
}
