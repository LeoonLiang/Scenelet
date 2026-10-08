import { Copy, X } from 'lucide-react';
import type { Failure } from '../lib/sources';

type Props = { failure: Failure; onClose: () => void; onCopy: () => void };

export default function ErrorPanel({ failure, onClose, onCopy }: Props) {
  return <section className="error-panel" role="alert">
    <div className="error-head">
      <strong>{failure.step}失败</strong>
      <button className="icon-btn" aria-label="关闭错误" onClick={onClose}><X size={15}/></button>
    </div>
    <p>{failure.message.split('\n')[0]}</p>
    <details>
      <summary>查看具体错误（{failure.at}）</summary>
      <pre>{failure.message}</pre>
      <button className="button secondary" onClick={onCopy}><Copy size={14}/>复制错误详情</button>
    </details>
    <small>可以改 Key、来源或筛选后重试，当前壁纸会保留。</small>
  </section>;
}
