import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Settings } from '../types';
import type { Theme } from '../lib/sources';
import UpdatePanel from '../components/UpdatePanel';
import SelectField from '../components/SelectField';
import { languages, t, type MessageKey } from '../i18n';
import { creditCss, creditText, styles as creditStyles } from '../lib/credit';

type Props = {
  screen?: { width: number; height: number }; onRestoreBackup: () => void;
  settings: Settings; platform: string; busy: boolean; cache: { bytes: number; files: number };
  theme: Theme; setTheme: (t: Theme) => void;
  header: ReactNode; keyPanel: ReactNode;
  onChange: (patch: Partial<Settings>) => void; onClearCache: () => void; onLink: (url: string) => void;
};

const toggles = [{ field: 'autostart', key: 'settings.autostart' }, { field: 'minimizeToTray', key: 'settings.minimizeToTray' }] as const;
const themes: { id: Theme; key: MessageKey }[] = [{ id: 'system', key: 'settings.theme.system' }, { id: 'light', key: 'settings.theme.light' }, { id: 'dark', key: 'settings.theme.dark' }];

export default function SettingsPage({ settings, platform, busy, cache, theme, setTheme, header, keyPanel, onChange, onClearCache, onLink, screen, onRestoreBackup }: Props) {
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
          options={[{ value: 'auto', label: t('screen.auto') }, ...['1920', '2560', '3840'].map(value => ({ value, label: `${value} px` }))]}/>
        <SelectField label={t('settings.cacheLimit')} value={String(settings.cacheLimit)} disabled={busy}
          onValueChange={value => onChange({ cacheLimit: Number(value) })}
          options={[256, 512, 1024, 2048].map(value => ({ value: String(value), label: `${value} MB` }))}/>
      </div>
      {screen && <p className="helper">{t('screen.hint', screen)}</p>}
      <div className="rows">
        {platform === 'win32' && <div className="row">
          <div><strong>{t('settings.syncLockScreen')}</strong><small id="lock-screen-description">{t('settings.syncLockScreenDesc')}</small></div>
          <button className={`toggle${settings.syncLockScreen ? ' on' : ''}`} role="switch" aria-label={t('settings.syncLockScreen')} aria-describedby="lock-screen-description" aria-checked={settings.syncLockScreen} disabled={busy}
            onClick={() => onChange({ syncLockScreen: !settings.syncLockScreen, lockScreenPrompt: false })}><span/></button>
        </div>}
        <div className="row">
          <div><strong>{t('settings.credit')}</strong><small id="credit-description">{t('settings.creditDesc')}</small></div>
          <button className={`toggle${settings.credit ? ' on' : ''}`} role="switch" aria-label={t('settings.credit')} aria-describedby="credit-description" aria-checked={settings.credit} disabled={busy}
            onClick={() => onChange({ credit: !settings.credit })}><span/></button>
        </div>
        {settings.credit && <div className="credit-styles" role="radiogroup" aria-label={t('settings.creditStyle')}>
          {creditStyles.map(style => <button key={style.id} role="radio" aria-checked={settings.creditStyle === style.id} className={`credit-style${settings.creditStyle === style.id ? ' selected' : ''}`} disabled={busy} onClick={() => onChange({ creditStyle: style.id })}>
            <span className="credit-sample" aria-hidden="true"><span className="credit-mark" style={creditCss(style, 'clamp(7px, 5.4cqw, 12px)')}>{creditText(style, 'Jane Doe')}</span></span>
            <span className="credit-style-name">{t(`settings.creditStyle.${style.id}` as MessageKey)}</span>
          </button>)}
        </div>}
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
      <p className="helper">{t(platform === 'darwin' ? 'settings.noteMac' : 'settings.note')}</p>
    </section>
    <section className="panel"><header className="panel-head"><h2>{t('backup.restore')}</h2><p>{t('backup.help')}</p></header><button className="button secondary" disabled={busy} onClick={onRestoreBackup}>{t('backup.restore')}</button></section>
    {keyPanel}
    <UpdatePanel/>
    <details className="api-note">
      <summary>{t('settings.apiNote')}</summary>
      <p>{t('settings.apiNoteText')}</p>
      <button className="text-button" onClick={() => onLink('https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines')}>{t('settings.apiNoteLink')} <ExternalLink size={12}/></button>
    </details>
  </div>;
}
