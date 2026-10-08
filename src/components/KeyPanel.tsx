import { useState } from 'react';
import { ArrowRight, Check, ChevronDown, ExternalLink, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { t, type MessageKey } from '../i18n';

type Props = {
  connected: boolean; desktop: boolean; busy: boolean;
  keyInput: string; setKeyInput: (v: string) => void;
  showKey: boolean; setShowKey: (v: boolean) => void;
  onConnect: () => void; onDisconnect: () => void; onImport: () => void;
  onLink: (url: string) => void;
};

const APPS_URL = 'https://unsplash.com/oauth/applications';
const steps: MessageKey[] = ['key.step1', 'key.step2', 'key.step3', 'key.step4'];

// Guide steps mark UI names with **bold** so each step stays one translatable string.
const rich = (text: string): ReactNode => text.split(/\*\*(.+?)\*\*/g).map((part, i) => i % 2 ? <b key={i}>{part}</b> : part);

export default function KeyPanel({ connected, desktop, busy, keyInput, setKeyInput, showKey, setShowKey, onConnect, onDisconnect, onImport, onLink }: Props) {
  const [guide, setGuide] = useState(false);
  return <section className={`panel key-panel${connected ? ' is-connected' : ''}`}>
    <header className="panel-head">
      <h2>{t(connected ? 'conn.connected' : 'key.title')}</h2>
      <p>{t(connected ? 'key.connectedDesc' : 'key.desc')}</p>
    </header>
    <form onSubmit={e => { e.preventDefault(); onConnect(); }}>
      <div className="key-label-row">
        <label className="field-label" htmlFor="access-key">Unsplash Access Key</label>
        <button type="button" className="text-button key-guide-toggle" aria-expanded={guide} aria-controls="key-guide" onClick={() => setGuide(!guide)}>
          {t(connected ? 'key.guideConnected' : 'key.guide')}<ChevronDown size={13} className={guide ? 'flipped' : ''}/>
        </button>
      </div>
      <div className="key-row">
        <div className="key-input-wrap">
          <input id="access-key" type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={keyInput} onChange={e => setKeyInput(e.target.value)} aria-describedby="access-key-help"/>
          <button type="button" className="icon-btn" aria-label={t(showKey ? 'key.hide' : 'key.show')} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
        </div>
        <button type="submit" disabled={busy || !keyInput.trim()} className="button primary">{busy ? <LoaderCircle size={15} className="spin"/> : <Check size={15}/>}{t(connected ? 'key.update' : 'key.connect')}</button>
        {connected && <button type="button" className="button secondary" disabled={busy} onClick={onDisconnect}>{t('key.remove')}</button>}
      </div>
    </form>
    {guide && <div className="key-guide" id="key-guide">
      <ol>{steps.map(step => <li key={step}>{rich(t(step))}</li>)}</ol>
      <p>{t('key.guideNote')}</p>
      <button type="button" className="button secondary" onClick={() => onLink(APPS_URL)}><ExternalLink size={14}/>{t('key.openApps')}</button>
    </div>}
    <p className="helper" id="access-key-help">
      {t(desktop ? 'key.helpDesktop' : 'key.helpBrowser')}
    </p>
    {!connected && <button className="text-button" onClick={onImport}>{t('key.useLocal')} <ArrowRight size={13}/></button>}
  </section>;
}
