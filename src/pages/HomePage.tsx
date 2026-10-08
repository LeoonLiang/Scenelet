import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = { header: ReactNode; nowShowing: ReactNode; connected: boolean; keyPanel: ReactNode; sourcePanel: ReactNode; onManageKey: () => void };

export default function HomePage({ header, nowShowing, connected, keyPanel, sourcePanel, onManageKey }: Props) {
  return <div className="home">
    {header}
    {nowShowing}
    {connected
      ? <div className="connected-line"><span>Unsplash 已连接</span><button className="text-button" onClick={onManageKey}>管理 Key <ArrowRight size={13}/></button></div>
      : keyPanel}
    {sourcePanel}
  </div>;
}
