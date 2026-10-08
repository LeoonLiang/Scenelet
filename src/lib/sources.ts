import type { OnlineSource, Photo, Settings } from '../types';

export type Page = 'home' | 'browse' | 'favorites' | 'library' | 'settings';
export type Failure = { step: string; message: string; at: string };
export type Theme = 'light' | 'dark' | 'system';

export const intervals = [15, 30, 60, 180, 360, 1440];

export const labels: Record<string, string> = {
  search: '分类',
  author: '作者',
  collection: 'Collection',
  topic: '主题',
  favorites: '我的收藏',
  library: '本地照片',
  discover: '全部照片',
};

export const isLocalKind = (kind: string) => ['favorites', 'library'].includes(kind);

export const read = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
};

export const friendly = (e: unknown) => String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': Error: /, '');

export const matches = (p: Photo, s: Settings) => {
  const ratio = p.width / p.height;
  return (s.orientation === 'all'
    || s.orientation === 'landscape' && ratio > 1.1
    || s.orientation === 'portrait' && ratio < .9
    || s.orientation === 'squarish' && ratio >= .9 && ratio <= 1.1) && p.width >= s.minWidth;
};

export const intervalLabel = (minutes: number) => minutes === 1440 ? '每天' : minutes < 60 || minutes % 60 !== 0 ? `${minutes} 分钟` : `${minutes / 60} 小时`;

export function normalizeSource(s: OnlineSource): OnlineSource {
  let value = s.value.trim();
  if (value.includes('://')) {
    const url = new URL(value); const parts = url.pathname.split('/').filter(Boolean);
    if (url.protocol !== 'https:' || url.hostname !== 'unsplash.com') throw new Error('请输入 https://unsplash.com 的来源链接。');
    if (s.kind === 'author' && parts[0]?.startsWith('@')) value = parts[0].slice(1);
    else if (s.kind === 'collection' && parts[0] === 'collections') value = parts[1] || '';
    else if (s.kind === 'topic' && ['t', 'topics'].includes(parts[0])) value = parts[1] || '';
    else throw new Error('链接类型与所选来源不一致，请选择作者、Collection 或主题。');
  }
  if (s.kind === 'author') value = value.replace(/^@/, '');
  if (!value && !['discover', 'favorites', 'library'].includes(s.kind)) throw new Error(`请先填写${labels[s.kind]}来源。`);
  if (['author', 'collection', 'topic'].includes(s.kind) && !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error('用户名或来源 ID 无效，请粘贴完整 Unsplash 链接。');
  return { ...s, value, name: s.name || (s.kind === 'author' ? `@${value}` : value || labels[s.kind]) };
}
