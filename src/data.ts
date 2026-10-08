import type { AppState, Photo } from './types';
import { t, type MessageKey } from './i18n';

const fixtures = [
  ['photo-1464822759023-fed622ff2c3b', 6000, 4000, '#82918b'],
  ['photo-1470770841072-f978cf4d019e', 5472, 3648, '#638f91'],
  ['photo-1441974231531-c6227db76b6e', 4000, 6000, '#506b4e'],
  ['photo-1500534623283-312aade485b7', 6000, 4000, '#a8ad89'],
  ['photo-1507525428034-b723cf961d3e', 6000, 4000, '#98c6c3'],
  ['photo-1472396961693-142e6e269027', 6000, 4000, '#8a8a73'],
  ['photo-1519681393784-d120267933ba', 6000, 4000, '#525e73'],
  ['photo-1469474968028-56623f02e42e', 6000, 4000, '#8d9e88'],
  ['photo-1447752875215-b2761acb3c5d', 6000, 4000, '#657453'],
  ['photo-1501785888041-af3ef285b470', 6000, 4000, '#729191'],
  ['photo-1518837695005-2083093ee35b', 4000, 6000, '#7eabb8'],
  ['photo-1418065460487-3e41a6c84dc5', 4000, 4000, '#738473'],
] as const;
// Built on demand so titles follow the active language.
export const demoPhotos = (): Photo[] => fixtures.map(([id, width, height, color], i) => ({ id, title: t(`demo.${i + 1}` as MessageKey), width, height, color, source: 'demo', thumb: `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=80`, full: `https://images.unsplash.com/${id}?auto=format&fit=max&w=1920&q=85`, author: t('demo.author'), link: 'https://unsplash.com' }));
// Quick category chips: the keyword is what we query Unsplash with; the label is localized.
export const tags: { keyword: string; key: MessageKey }[] = [
  { keyword: '', key: 'tag.all' },
  ...(['mountains', 'forest', 'ocean', 'lake', 'architecture', 'minimal', 'stars'] as const).map(keyword => ({ keyword, key: `tag.${keyword}` as MessageKey })),
];
export const tagLabel = (keyword: string) => { const tag = tags.find(x => x.keyword && x.keyword === keyword); return tag ? t(tag.key) : undefined; };
export const initial: AppState = { photos: [], favorites: [], playlists: [], history: [], current: null, settings: { language: 'system', interval: 60, rotation: false, order: 'shuffle', rotationSource: 'favorites', fit: 'fill', autostart: false, minimizeToTray: true, quality: '2560', cacheLimit: 1024, orientation: 'landscape', minWidth: 0, onlineSource: { kind: 'author', value: '', name: '' } }, connected: false, desktop: false, platform: 'web', screens: [] };
