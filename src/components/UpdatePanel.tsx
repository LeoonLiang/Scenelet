import { useEffect, useState } from 'react';
import { ArrowDownToLine, RefreshCw } from 'lucide-react';
import type { UpdateStatus } from '../types';
import { appVersion } from '../version';
import { t } from '../i18n';

export default function UpdatePanel() {
  const api = window.framewall;
  const [status, setStatus] = useState<UpdateStatus>({ mode: 'disabled', state: 'idle', currentVersion: appVersion, version: '', percent: 0, message: t('update.browser'), url: 'https://github.com/LeoonLiang/Scenelet/releases' });
  useEffect(() => { if (!api) return; api.updateStatus().then(setStatus).catch(e => setStatus(s => ({ ...s, state: 'error', message: e.message }))); return api.onUpdater(setStatus); }, []);
  async function perform(work: () => Promise<unknown>) { try { await work(); } catch (e) { setStatus(s => ({ ...s, message: String(e instanceof Error ? e.message : e) })); } }
  return <section className="panel">
    <header className="panel-head">
      <h2>{t('update.title')}</h2>
      <p>{t('update.version', { version: status.currentVersion })}{status.version && t('update.newVersion', { version: status.version })}</p>
    </header>
    <p className="helper" role="status">{status.message}</p>
    {status.state === 'downloading' && <progress aria-label={t('update.progress')} value={status.percent} max={100}/>}
    <div className="panel-actions">
      <button className="button secondary" disabled={!api || status.mode === 'disabled' || ['checking', 'downloading', 'ready', 'downloaded'].includes(status.state)} onClick={() => void perform(async () => setStatus(await api!.checkUpdate()))}><RefreshCw size={14}/>{t('update.check')}</button>
      {status.state === 'ready'
        ? <button className="button primary" onClick={() => void perform(() => api!.installUpdate())}>{t('update.install')}</button>
        : status.state === 'downloaded'
        ? <button className="button primary" onClick={() => void perform(() => api!.openDownloadedUpdate())}><ArrowDownToLine size={14}/>{t(status.packageType === 'dmg' ? 'update.openInstaller' : 'update.showDownload')}</button>
        : <button className="button secondary" onClick={() => api ? void perform(() => api.openUpdate()) : window.open(status.url, '_blank', 'noopener,noreferrer')}><ArrowDownToLine size={14}/>{t(status.state === 'available' ? 'update.download' : 'update.releases')}</button>}
    </div>
  </section>;
}
