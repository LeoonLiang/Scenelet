import { FolderOpen, Heart, Settings2, Shuffle } from 'lucide-react';
import type { Page } from '../lib/sources';
import { appVersion } from '../version';
import logoUrl from '../assets/logo.png';

type Props = { page: Page; setPage: (p: Page) => void; favorites: number; connected: boolean; desktop: boolean };

const nav = [
  { id: 'home', text: '换壁纸', Icon: Shuffle },
  { id: 'favorites', text: '我的收藏', Icon: Heart },
  { id: 'library', text: '本地照片', Icon: FolderOpen },
] as const;

export default function Sidebar({ page, setPage, favorites, connected, desktop }: Props) {
  const item = (id: Page, text: string, Icon: typeof Shuffle, count?: number) => (
    <button key={id} className={`nav-item${page === id || id === 'home' && page === 'browse' ? ' active' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => setPage(id)}>
      <Icon size={17} strokeWidth={1.75}/><span>{text}</span>{!!count && <small>{count}</small>}
    </button>
  );
  return <aside className="sidebar">
    <div className="brand"><img src={logoUrl} alt="" width={28} height={28}/><span>拾景</span></div>
    <nav aria-label="主导航">{nav.map(({ id, text, Icon }) => item(id, text, Icon, id === 'favorites' ? favorites : undefined))}</nav>
    <div className="sidebar-bottom">
      {item('settings', '偏好设置', Settings2)}
      <div className="connection">
        <i className={connected ? 'online' : ''} aria-hidden="true"/>
        <span>{connected ? 'Unsplash 已连接' : desktop ? '未连接 Unsplash' : '浏览器预览'}</span>
        <span className="version">v{appVersion}</span>
      </div>
    </div>
  </aside>;
}
