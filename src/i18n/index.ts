import { useSyncExternalStore } from 'react';
import zh from './zh';
import en from './en';

export type MessageKey = keyof typeof zh;
export type Messages = Record<MessageKey, string>;
export type Lang = 'zh' | 'en';
export type LangPref = Lang | 'system';

// Shown in their own language so they stay recognizable whatever is selected.
export const languages: { id: Lang; name: string }[] = [{ id: 'zh', name: '简体中文' }, { id: 'en', name: 'English' }];
const dictionaries: Record<Lang, Messages> = { zh, en };

// Same rule as electron/i18n.cjs: the first Chinese or English entry wins, anything else falls back to English.
export function resolveLanguage(preferred: readonly string[]): Lang {
  for (const tag of preferred) {
    const lower = tag.toLowerCase();
    if (lower.startsWith('zh')) return 'zh';
    if (lower.startsWith('en')) return 'en';
  }
  return 'en';
}

export const hasMessage = (key: string): key is MessageKey => key in zh;

// The last applied language is cached so the first paint matches before bootstrap() returns.
let current: Lang = (() => { try { const saved = JSON.parse(localStorage.getItem('framewall-lang') || 'null'); if (saved === 'zh' || saved === 'en') return saved; } catch {} return resolveLanguage(navigator.languages); })();
const listeners = new Set<() => void>();

export function t(key: MessageKey, vars: Record<string, string | number> = {}) {
  return dictionaries[current][key].replace(/\{(\w+)\}/g, (match, name: string) => name in vars ? String(vars[name]) : match);
}

function applyDocument() {
  document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';
  document.title = t('app.title');
}
applyDocument();

export function setLanguage(lang: Lang) {
  if (lang === current) return;
  current = lang;
  localStorage.setItem('framewall-lang', JSON.stringify(lang));
  applyDocument();
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function useI18n() {
  const lang = useSyncExternalStore(subscribe, () => current);
  return { t, lang };
}
