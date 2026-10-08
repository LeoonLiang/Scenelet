import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Settings } from '../types';
import type { Theme } from '../lib/sources';
import UpdatePanel from '../components/UpdatePanel';

type Props = {
  settings: Settings; busy: boolean; cache: { bytes: number; files: number };
  theme: Theme; setTheme: (t: Theme) => void;
  header: ReactNode; keyPanel: ReactNode;
  onChange: (patch: Partial<Settings>) => void; onClearCache: () => void; onLink: (url: string) => void;
};

const toggles = [{ field: 'autostart', title: '开机启动' }, { field: 'minimizeToTray', title: '关闭窗口后留在托盘' }] as const;
const themes: { id: Theme; text: string }[] = [{ id: 'system', text: '跟随系统' }, { id: 'light', text: '浅色' }, { id: 'dark', text: '深色' }];

export default function SettingsPage({ settings, busy, cache, theme, setTheme, header, keyPanel, onChange, onClearCache, onLink }: Props) {
  return <div className="settings-page">
    {header}
    <section className="panel">
      <header className="panel-head"><h2>桌面与存储</h2><p>来源、方向和换图间隔在「换壁纸」页设置。</p></header>
      <div className="filter-grid">
        <label className="field"><span>壁纸布局</span>
          <select value={settings.fit} disabled={busy} onChange={e => onChange({ fit: e.target.value })}>
            <option value="fill">填充屏幕</option><option value="fit">适应屏幕</option><option value="stretch">拉伸</option><option value="center">居中</option>
          </select>
        </label>
        <label className="field"><span>下载分辨率</span>
          <select value={settings.quality} disabled={busy} onChange={e => onChange({ quality: e.target.value })}>
            <option value="1920">1920 px</option><option value="2560">2560 px</option><option value="3840">3840 px</option>
          </select>
        </label>
        <label className="field"><span>缓存上限</span>
          <select value={settings.cacheLimit} disabled={busy} onChange={e => onChange({ cacheLimit: Number(e.target.value) })}>
            {[256, 512, 1024, 2048].map(v => <option key={v} value={v}>{v} MB</option>)}
          </select>
        </label>
      </div>
      <div className="rows">
        <div className="row">
          <strong>外观</strong>
          <div className="segmented" role="radiogroup" aria-label="外观">
            {themes.map(t => <button key={t.id} role="radio" aria-checked={theme === t.id} className={theme === t.id ? 'selected' : ''} onClick={() => setTheme(t.id)}>{t.text}</button>)}
          </div>
        </div>
        {toggles.map(({ field, title }) => <div className="row" key={field}>
          <strong>{title}</strong>
          <button className={`toggle${settings[field] ? ' on' : ''}`} role="switch" aria-label={title} aria-checked={!!settings[field]} disabled={busy} onClick={() => onChange({ [field]: !settings[field] })}><span/></button>
        </div>)}
        <div className="row">
          <div><strong>图片缓存</strong><small>{(cache.bytes / 1048576).toFixed(1)} MB，清理时保留当前壁纸</small></div>
          <button className="button secondary" disabled={busy} onClick={onClearCache}>清理缓存</button>
        </div>
      </div>
      <p className="helper">macOS 使用系统布局。暂不支持多屏独立壁纸、锁屏和视频壁纸。</p>
    </section>
    {keyPanel}
    <UpdatePanel/>
    <details className="api-note">
      <summary>Unsplash API 使用说明</summary>
      <p>官方 API Guidelines 对壁纸类应用的用途有限制，公开发行前需要确认许可。</p>
      <button className="text-button" onClick={() => onLink('https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines')}>查看官方说明 <ExternalLink size={12}/></button>
    </details>
  </div>;
}
