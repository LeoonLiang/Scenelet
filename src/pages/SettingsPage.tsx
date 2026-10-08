import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Settings } from '../types';
import type { Theme } from '../lib/sources';
import UpdatePanel from '../components/UpdatePanel';
import SelectField from '../components/SelectField';
import { languages, t, type MessageKey } from '../i18n';

type Props = {
  settings: Settings; busy: boolean; cache: { bytes: number; files: number };
  theme: Theme; setTheme: (t: Theme) => void;
  header: ReactNode; keyPanel: ReactNode;
  onChange: (patch: Partial<Settings>) => void; onClearCache: () => void; onLink: (url: string) => void;
};

const toggles = [{ field: 'autostart', key: 'settings.autostart' }, { field: 'minimizeToTray', key: 'settings.minimizeToTray' }] as const;
const themes: { id: Theme; key: MessageKey }[] = [{ id: 'system', key: 'settings.theme.system' }, { id: 'light', key: 'settings.theme.light' }, { id: 'dark', key: 'settings.theme.dark' }];

export default function SettingsPage({ settings, busy, cache, theme, setTheme, header, keyPanel, onChange, onClearCache, onLink }: Props) {
  return <div className="settings-page">
    {header}
    <section className="panel">
      <header className="panel-head"><h2>{t('settings.desktop')}</h2><p>{t('settings.desktopDesc')}</p></header>
      <div className="filter-grid">
        <SelectField label={t('settings.fit')} value={settings.fit} disabled={busy}
          onValueChange={fit => onChange({ fit })}
          options={(['fill', 'fit', 'stretch', 'center'] as const).map(value => ({ value, label: t(`settings.fit.${value}`) }))}/>
        <SelectField label={t('settings.quality')} value={settings.quality} disabled={busy}
          onValueChange={quality => onChange({ quality })}
          options={['1920', '2560', '3840'].map(value => ({ value, label: `${value} px` }))}/>
        <SelectField label={t('settings.cacheLimit')} value={String(settings.cacheLimit)} disabled={busy}
          onValueChange={value => onChange({ cacheLimit: Number(value) })}
          options={[256, 512, 1024, 2048].map(value => ({ value: String(value), label: `${value} MB` }))}/>
      </div>
      <div className="rows">
        <div className="row">
          <strong>{t('settings.appearance')}</strong>
          <div className="segmented" role="radiogroup" aria-label={t('settings.appearance')}>
            {themes.map(item => <button key={item.id} role="radio" aria-checked={theme === item.id} className={theme === item.id ? 'selected' : ''} onClick={() => setTheme(item.id)}>{t(item.key)}</button>)}
          </div>
        </div>
        <div className="row">
          <strong>{t('settings.language')}</strong>
          <div className="segmented" role="radiogroup" aria-label={t('settings.language')}>
            {[{ id: 'system' as const, label: t('settings.language.system') }, ...languages.map(l => ({ id: l.id, label: l.name }))].map(item =>
              <button key={item.id} role="radio" lang={item.id === 'system' ? undefined : item.id} aria-checked={settings.language === item.id} className={settings.language === item.id ? 'selected' : ''} disabled={busy} onClick={() => onChange({ language: item.id })}>{item.label}</button>)}
          </div>
        </div>
        {toggles.map(({ field, key }) => <div className="row" key={field}>
          <strong>{t(key)}</strong>
          <button className={`toggle${settings[field] ? ' on' : ''}`} role="switch" aria-label={t(key)} aria-checked={!!settings[field]} disabled={busy} onClick={() => onChange({ [field]: !settings[field] })}><span/></button>
        </div>)}
        <div className="row">
          <div><strong>{t('settings.cache')}</strong><small>{t('settings.cacheInfo', { size: (cache.bytes / 1048576).toFixed(1) })}</small></div>
          <button className="button secondary" disabled={busy} onClick={onClearCache}>{t('settings.clearCache')}</button>
        </div>
      </div>
      <p className="helper">{t('settings.note')}</p>
    </section>
    {keyPanel}
    <UpdatePanel/>
    <details className="api-note">
      <summary>{t('settings.apiNote')}</summary>
      <p>{t('settings.apiNoteText')}</p>
      <button className="text-button" onClick={() => onLink('https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines')}>{t('settings.apiNoteLink')} <ExternalLink size={12}/></button>
    </details>
  </div>;
}
