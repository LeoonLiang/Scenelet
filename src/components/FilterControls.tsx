import type { Dispatch, SetStateAction } from 'react';
import type { Settings } from '../types';
import { intervalLabel, intervals } from '../lib/sources';
import { t } from '../i18n';
import SelectField from './SelectField';

export type IntervalState = { custom: boolean; setCustom: (v: boolean) => void; minutes: string; setMinutes: (v: string) => void; off: boolean; setOff: (v: boolean) => void };
type Props = { filters: Settings; setFilters: Dispatch<SetStateAction<Settings>>; busy: boolean; interval?: IntervalState; className?: string };

export default function FilterControls({ filters, setFilters, busy, interval, className = '' }: Props) {
  return <div className={`filter-grid ${className}`}>
    <SelectField label={t('filter.orientation')} disabled={busy} value={filters.orientation}
      onValueChange={value => setFilters(s => ({ ...s, orientation: value }))}
      options={(['landscape', 'portrait', 'squarish', 'all'] as const).map(value => ({ value, label: t(`filter.orientation.${value}`) }))}/>
    <SelectField label={t('filter.minWidth')} disabled={busy} value={String(filters.minWidth)}
      onValueChange={value => setFilters(s => ({ ...s, minWidth: Number(value) }))}
      options={[{ value: '0', label: t('filter.minWidth.none') }, ...[1920, 2560, 3840].map(value => ({ value: String(value), label: `${value} px` }))]}/>
    {interval && <SelectField label={t('filter.interval')} disabled={busy} value={interval.off ? 'off' : interval.custom ? 'custom' : String(filters.interval)}
      onValueChange={value => { interval.setOff(value === 'off'); interval.setCustom(value === 'custom'); if (value !== 'custom' && value !== 'off') setFilters(s => ({ ...s, interval: Number(value) })); }}
      options={[{ value: 'off', label: t('filter.off') }, ...intervals.map(value => ({ value: String(value), label: intervalLabel(value) })), { value: 'custom', label: t('filter.custom') }]}/>}
    {interval?.custom && <label className="field custom-interval">
      <span>{t('filter.customLabel')}</span>
      <input type="number" min="1" max="10080" step="1" disabled={busy} value={interval.minutes} onChange={e => interval.setMinutes(e.target.value)} aria-describedby="custom-interval-help"/>
      <small id="custom-interval-help">{t('filter.customHelp')}</small>
    </label>}
  </div>;
}
