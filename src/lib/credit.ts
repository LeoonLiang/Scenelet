import type { CSSProperties } from 'react';
import creditStyles from '../../electron/credit-styles.json';

// Same definitions the main process uses to draw the credit onto the wallpaper (electron/credit-layout.cjs).
export type CreditStyle = (typeof creditStyles.styles)[number];
export const styles: CreditStyle[] = creditStyles.styles;
export const defaultStyle = creditStyles.default;

export function creditStyle(id: string): CreditStyle {
  return styles.find(s => s.id === id) || styles.find(s => s.id === defaultStyle)!;
}
export function creditText(style: CreditStyle, author: string) {
  const text = style.template.replace('{author}', author.trim());
  return style.uppercase ? text.toUpperCase() : text;
}
// `size` is the base text height (CSS length); each style scales it like the wallpaper renderer does.
export function creditCss(style: CreditStyle, size: string): CSSProperties {
  return { fontFamily: style.family, fontWeight: style.weight, fontStyle: style.italic ? 'italic' : 'normal', letterSpacing: `${style.tracking}em`, fontSize: `calc(${size} * ${style.scale})` };
}
