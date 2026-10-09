import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { t } from '../i18n';

type Props = { header: ReactNode; nowShowing: ReactNode; connected: boolean; keyPanel: ReactNode; sourcePanel: ReactNode; batchPanel: ReactNode; onManageKey: () => void };

export default function HomePage({ header, nowShowing, connected, keyPanel, sourcePanel, batchPanel, onManageKey }: Props) {
  return <div className="home">
    {header}
    {connected
      ? <div className="connected-line"><span>{t('conn.connected')}</span><button className="text-button" onClick={onManageKey}>{t('home.manageKey')} <ArrowRight size={13}/></button></div>
      : keyPanel}
    {sourcePanel}
    {batchPanel}
    {nowShowing}
  </div>;
}
