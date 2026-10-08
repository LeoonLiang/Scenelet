import type { OnlineSource, Photo, Settings } from '../types';
import { hasMessage, t } from '../i18n';
import { tagLabel } from '../data';

export type Page = 'home' | 'browse' | 'favorites' | 'library' | 'settings';
export type Failure = { step: string; message: string; at: string };
export type Theme = 'light' | 'dark' | 'system';

export const intervals = [15, 30, 60, 180, 360, 1440];

// Source kinds are stable ids; their display names follow the active language.
export const kindLabel = (kind: string) => { const key = `kind.${kind}`; return hasMessage(key) ? t(key) : kind; };

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

export const intervalLabel = (minutes: number) => minutes === 1440 ? t('interval.daily')
  : minutes < 60 || minutes % 60 !== 0 ? t('interval.minutes', { n: minutes })
  : minutes === 60 ? t('interval.hour') : t('interval.hours', { n: minutes / 60 });

export function normalizeSource(s: OnlineSource): OnlineSource {
  let value = s.value.trim();
  if (value.includes('://')) {
    const url = new URL(value); const parts = url.pathname.split('/').filter(Boolean);
    if (url.protocol !== 'https:' || url.hostname !== 'unsplash.com') throw new Error(t('err.unsplashLink'));
    if (s.kind === 'author' && parts[0]?.startsWith('@')) value = parts[0].slice(1);
    else if (s.kind === 'collection' && parts[0] === 'collections') value = parts[1] || '';
    else if (s.kind === 'topic' && ['t', 'topics'].includes(parts[0])) value = parts[1] || '';
    else throw new Error(t('err.linkMismatch'));
  }
  if (s.kind === 'author') value = value.replace(/^@/, '');
  if (!value && !['discover', 'favorites', 'library'].includes(s.kind)) throw new Error(t('err.sourceEmpty', { kind: kindLabel(s.kind) }));
  if (['author', 'collection', 'topic'].includes(s.kind) && !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error(t('err.sourceInvalid'));
  // Kinds without a value (discover/favorites/library) keep an empty name so the label is localized at render time.
  return { ...s, value, name: s.name || (s.kind === 'author' ? `@${value}` : value) };
}

// Display name for a source. Names saved by older versions may be a localized kind label; prefer the live label for valueless kinds.
export const sourceName = (s: Pick<OnlineSource, 'kind' | 'value' | 'name'>) => !s.value ? kindLabel(s.kind) : (s.kind === 'search' && tagLabel(s.value)) || s.name || (s.kind === 'author' ? `@${s.value}` : s.value);
