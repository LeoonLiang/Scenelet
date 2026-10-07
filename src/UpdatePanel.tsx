import { useEffect, useState } from 'react';
import { ArrowDownToLine, RefreshCw } from 'lucide-react';
import type { UpdateStatus } from './types';
import { appVersion } from './version';
export default function UpdatePanel() {
  const api = window.framewall;
  const [status, setStatus] = useState<UpdateStatus>({ mode: 'disabled', state: 'idle', currentVersion: appVersion, version: '', percent: 0, message: '浏览器预览不执行自动更新。', url: 'https://github.com/LeoonLiang/Scenelet/releases' });
  useEffect(() => { if (!api) return; api.updateStatus().then(setStatus).catch(e => setStatus(s => ({ ...s, state: 'error', message: e.message }))); return api.onUpdater(setStatus); }, []);
  async function perform(work: () => Promise<unknown>) { try { await work(); } catch (e) { setStatus(s => ({ ...s, state: 'error', message: String(e instanceof Error ? e.message : e) })); } }
  return <section className="settings-panel"><div className="panel-heading"><RefreshCw size={21}/><div><h2>应用更新</h2><p>拾景 v{status.currentVersion}{status.version && ` · 新版 v${status.version}`}</p></div></div><p className="helper" role="status">{status.message}</p>{status.state === 'downloading' && <progress aria-label="更新下载进度" value={status.percent} max={100}/>}<div className="online-form-actions"><button className="button secondary" disabled={!api || status.mode === 'disabled' || ['checking', 'downloading', 'ready'].includes(status.state)} onClick={() => void perform(async () => setStatus(await api!.checkUpdate()))}><RefreshCw size={15}/>检查更新</button>{status.state === 'ready' ? <button className="button primary" onClick={() => void perform(() => api!.installUpdate())}>重启并安装</button> : <button className="button secondary" onClick={() => api ? void perform(() => api.openUpdate()) : window.open(status.url, '_blank', 'noopener,noreferrer')}><ArrowDownToLine size={15}/>{status.state === 'available' ? '下载新版' : '查看发行版本'}</button>}</div></section>;
}
