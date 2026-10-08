import { FolderOpen, Heart, Settings2, Shuffle } from 'lucide-react';
import type { Page } from '../lib/sources';
import { appVersion } from '../version';
import logoUrl from '../assets/logo.png';
import { t, type MessageKey } from '../i18n';

type Props = { page: Page; setPage: (p: Page) => void; favorites: number; connected: boolean; desktop: boolean };

const nav: { id: Page; key: MessageKey; Icon: typeof Shuffle }[] = [
  { id: 'home', key: 'nav.home', Icon: Shuffle },
  { id: 'favorites', key: 'kind.favorites', Icon: Heart },
  { id: 'library', key: 'kind.library', Icon: FolderOpen },
];

export default function Sidebar({ page, setPage, favorites, connected, desktop }: Props) {
  const item = (id: Page, message: MessageKey, Icon: typeof Shuffle, count?: number) => (
    <button key={id} className={`nav-item${page === id || id === 'home' && page === 'browse' ? ' active' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => setPage(id)}>
      <Icon size={17} strokeWidth={1.75}/><span>{t(message)}</span>{!!count && <small>{count}</small>}
    </button>
  );
  return <aside className="sidebar">
    <div className="brand"><img src={logoUrl} alt="" width={28} height={28}/><span>{t('app.name')}</span></div>
    <nav aria-label={t('nav.main')}>{nav.map(({ id, key, Icon }) => item(id, key, Icon, id === 'favorites' ? favorites : undefined))}</nav>
    <div className="sidebar-bottom">
      {item('settings', 'nav.settings', Settings2)}
      <div className="connection">
        <i className={connected ? 'online' : ''} aria-hidden="true"/>
        <span>{t(connected ? 'conn.connected' : desktop ? 'conn.disconnected' : 'conn.browser')}</span>
        <span className="version">v{appVersion}</span>
      </div>
    </div>
  </aside>;
}
