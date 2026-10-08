import { ArrowRight, Check, Eye, EyeOff, LoaderCircle } from 'lucide-react';

type Props = {
  connected: boolean; desktop: boolean; busy: boolean;
  keyInput: string; setKeyInput: (v: string) => void;
  showKey: boolean; setShowKey: (v: boolean) => void;
  onConnect: () => void; onDisconnect: () => void; onImport: () => void;
};

export default function KeyPanel({ connected, desktop, busy, keyInput, setKeyInput, showKey, setShowKey, onConnect, onDisconnect, onImport }: Props) {
  return <section className={`panel key-panel${connected ? ' is-connected' : ''}`}>
    <header className="panel-head">
      <h2>{connected ? 'Unsplash 已连接' : '连接 Unsplash'}</h2>
      <p>{connected ? 'Key 已加密保存在本机，下次打开自动恢复。' : '粘贴 Access Key，连接后就能使用在线照片。'}</p>
    </header>
    <form onSubmit={e => { e.preventDefault(); onConnect(); }}>
      <label className="field-label" htmlFor="access-key">Unsplash Access Key</label>
      <div className="key-row">
        <div className="key-input-wrap">
          <input id="access-key" type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={keyInput} onChange={e => setKeyInput(e.target.value)} aria-describedby="access-key-help"/>
          <button type="button" className="icon-btn" aria-label={showKey ? '隐藏 Key' : '显示 Key'} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
        </div>
        <button type="submit" disabled={busy || !keyInput.trim()} className="button primary">{busy ? <LoaderCircle size={15} className="spin"/> : <Check size={15}/>}{connected ? '更新并保存' : '连接并保存'}</button>
        {connected && <button type="button" className="button secondary" disabled={busy} onClick={onDisconnect}>移除 Key</button>}
      </div>
    </form>
    <p className="helper" id="access-key-help">
      {desktop ? '使用 Access Key，不是 Secret Key。点眼睛图标可以查看已保存的 Key。' : '浏览器只用于界面预览，请在桌面客户端中连接和保存 Key。'}
    </p>
    {!connected && <button className="text-button" onClick={onImport}>先用本地照片 <ArrowRight size={13}/></button>}
  </section>;
}
