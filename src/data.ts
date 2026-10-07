import type { AppState, Photo } from './types';
const fixtures = [
  ['photo-1464822759023-fed622ff2c3b', '山的另一边', '山野', 6000, 4000, '#82918b'],
  ['photo-1470770841072-f978cf4d019e', '湖畔的慢时光', '湖泊', 5472, 3648, '#638f91'],
  ['photo-1441974231531-c6227db76b6e', '走进绿色深处', '森林', 4000, 6000, '#506b4e'],
  ['photo-1500534623283-312aade485b7', '旷野的呼吸', '自然', 6000, 4000, '#a8ad89'],
  ['photo-1507525428034-b723cf961d3e', '海风经过这里', '海洋', 6000, 4000, '#98c6c3'],
  ['photo-1472396961693-142e6e269027', '林间来客', '自然', 6000, 4000, '#8a8a73'],
  ['photo-1519681393784-d120267933ba', '星光与雪山', '星空', 6000, 4000, '#525e73'],
  ['photo-1469474968028-56623f02e42e', '远山的晨光', '山野', 6000, 4000, '#8d9e88'],
  ['photo-1447752875215-b2761acb3c5d', '森林小径', '森林', 6000, 4000, '#657453'],
  ['photo-1501785888041-af3ef285b470', '此刻，停在湖边', '湖泊', 6000, 4000, '#729191'],
  ['photo-1518837695005-2083093ee35b', '潮汐的形状', '海洋', 4000, 6000, '#7eabb8'],
  ['photo-1418065460487-3e41a6c84dc5', '一束光的方向', '森林', 4000, 4000, '#738473'],
] as const;
export const demos: Photo[] = fixtures.map(([id, title, , width, height, color]) => ({ id, title, width, height, color, source: 'demo', thumb: `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=80`, full: `https://images.unsplash.com/${id}?auto=format&fit=max&w=1920&q=85`, author: 'Unsplash · 界面演示', link: 'https://unsplash.com' }));
export const tags = ['全部', '山野', '森林', '海洋', '湖泊', '建筑', '极简', '星空'];
export const keywords: Record<string, string> = { 山野: 'mountains', 森林: 'forest', 海洋: 'ocean', 湖泊: 'lake', 建筑: 'architecture', 极简: 'minimal', 星空: 'stars' };
export const demoTags = Object.fromEntries(fixtures.map(([id, , tag]) => [id, tag]));
export const initial: AppState = { photos: [], favorites: [], playlists: [], history: [], current: null, settings: { interval: 60, rotation: false, order: 'shuffle', rotationSource: 'favorites', fit: 'fill', autostart: false, minimizeToTray: true, quality: '2560', cacheLimit: 1024, orientation: 'landscape', minWidth: 0, onlineSource: { kind: 'author', value: '', name: '' } }, connected: false, desktop: false, platform: 'web', screens: [] };
export const authors = [{ name: 'Annie Spratt', username: 'anniespratt', note: '日常、自然与细腻光线' }, { name: 'Samuel Ferrara', username: 'samferrara', note: '山峦、旅行与远方' }, { name: 'Luke Chesser', username: 'lukechesser', note: '色彩、抽象与极简' }];
