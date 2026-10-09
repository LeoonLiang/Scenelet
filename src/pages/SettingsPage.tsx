import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Settings } from '../types';
import type { Theme } from '../lib/sources';
import UpdatePanel from '../components/UpdatePanel';
import SelectField from '../components/SelectField';
import { languages, t, type MessageKey } from '../i18n';
import { creditCss, creditText, styles as creditStyles } from '../lib/credit';

type Props = {
  screen?: { width: number; height: number }; onFeedback: () => void;
  settings: Settings; platform: string; busy: boolean; cache: { bytes: number; files: number };
  downloadDirectory?: string; onChooseDownloadDirectory: () => void;
  theme: Theme; setTheme: (t: Theme) => void;
  header: ReactNode; keyPanel: ReactNode;
  onChange: (patch: Partial<Settings>) => void; onClearCache: () => void; onLink: (url: string) => void;
};

const toggles = [{ field: 'autostart', key: 'settings.autostart' }, { field: 'minimizeToTray', key: 'settings.minimizeToTray' }] as const;
const themes: { id: Theme; key: MessageKey }[] = [{ id: 'system', key: 'settings.theme.system' }, { id: 'light', key: 'settings.theme.light' }, { id: 'dark', key: 'settings.theme.dark' }];

export default function SettingsPage({ settings, platform, busy, cache, theme, setTheme, header, keyPanel, onChange, onClearCache, onLink, screen, onFeedback, downloadDirectory, onChooseDownloadDirectory }: Props) {
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
        <div className="row download-directory-row">
          <div><strong>{t('settings.downloadDirectory')}</strong><small className="download-directory" title={downloadDirectory}>{downloadDirectory || t('settings.downloadDirectoryDesktop')}</small></div>
          <button className="button secondary" disabled={busy || platform === 'web'} onClick={onChooseDownloadDirectory}>{t('settings.changeDownloadDirectory')}</button>
        </div>
        {platform === 'win32' && <div className="row">
          <div><strong>{t('settings.syncLockScreen')}</strong><small id="lock-screen-description">{t('settings.syncLockScreenDesc')}</small></div>
          <button className={`toggle${settings.syncLockScreen ? ' on' : ''}`} role="switch" aria-label={t('settings.syncLockScreen')} aria-describedby="lock-screen-description" aria-checked={settings.syncLockScreen} disabled={busy}
            onClick={() => onChange({ syncLockScreen: !settings.syncLockScreen, lockScreenPrompt: false })}><span/></button>
        </div>}
        <div className="row credit-row">
          <div><strong id="credit-label">{t('settings.credit')}</strong><small id="credit-description">{t('settings.creditDesc')}</small></div>
        </div>
        <div className="credit-styles" role="radiogroup" aria-labelledby="credit-label" aria-describedby="credit-description">
          {['none', ...creditStyles.map(style => style.id)].map(id => {
            const style = creditStyles.find(s => s.id === id), selected = settings.creditStyle === id;
            return <button key={id} role="radio" aria-checked={selected} className={`credit-style${selected ? ' selected' : ''}`} disabled={busy} onClick={() => { if (!selected) onChange({ creditStyle: id }); }}>
              <span className="credit-sample" aria-hidden="true">{style && <span className="credit-mark" style={creditCss(style, 'clamp(7px, 5.4cqw, 12px)')}>{creditText(style, 'Jane Doe')}</span>}</span>
              <span className="credit-style-name">{t(`settings.creditStyle.${id}` as MessageKey)}</span>
            </button>;
          })}
        </div>
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
        {platform !== 'web' && <div className="row">
          <div><strong>{t(platform === 'darwin' ? 'settings.showMenuBarIcon' : 'settings.showTrayIcon')}</strong><small id="tray-icon-description">{t(platform === 'darwin' ? 'settings.showMenuBarIconDesc' : 'settings.showTrayIconDesc')}</small></div>
          <button className={`toggle${settings.showTrayIcon ? ' on' : ''}`} role="switch" aria-label={t(platform === 'darwin' ? 'settings.showMenuBarIcon' : 'settings.showTrayIcon')} aria-describedby="tray-icon-description" aria-checked={settings.showTrayIcon} disabled={busy}
            onClick={() => onChange({ showTrayIcon: !settings.showTrayIcon })}><span/></button>
        </div>}
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
    {keyPanel}
    <UpdatePanel/>
    <section className="panel"><header className="panel-head"><h2>{t('feedback.title')}</h2><p>{t('feedback.help')}</p></header><button className="button secondary" onClick={onFeedback}>{t('feedback.open')} <ExternalLink size={14}/></button></section>
    <details className="api-note">
      <summary>{t('settings.apiNote')}</summary>
      <p>{t('settings.apiNoteText')}</p>
      <button className="text-button" onClick={() => onLink('https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines')}>{t('settings.apiNoteLink')} <ExternalLink size={12}/></button>
    </details>
  </div>;
}
