// Pure geometry for the photographer credit that is drawn onto a wallpaper copy.
// Everything here works in physical screen pixels and output-image pixels, so it can be unit tested.
const crypto = require('node:crypto');
const creditStyles = require('./credit-styles.json');

// Bump when the drawing changes so cached credited copies are regenerated.
const VERSION = 2;
const FONT_RATIO = 0.0125; // text height relative to the primary screen height
const MARGIN_RATIO = 0.022; // gap to the visible edge relative to the primary screen height

// Electron display -> physical pixel size plus the space taken by the menu bar, Dock or taskbar.
function physical(display) {
  const scale = display.scaleFactor || 1;
  const bounds = display.bounds || { x: 0, y: 0, ...display.size };
  const area = display.workArea || bounds;
  return {
    width: Math.round(bounds.width * scale), height: Math.round(bounds.height * scale), primary: !!display.primary,
    insets: {
      top: Math.max(0, area.y - bounds.y) * scale,
      left: Math.max(0, area.x - bounds.x) * scale,
      bottom: Math.max(0, bounds.y + bounds.height - (area.y + area.height)) * scale,
      right: Math.max(0, bounds.x + bounds.width - (area.x + area.width)) * scale,
    },
  };
}

// How the system draws an image of width x height on a screen: per-axis scale.
function drawScale(fit, image, screen) {
  const x = screen.width / image.width, y = screen.height / image.height;
  if (fit === 'stretch') return { x, y };
  if (fit === 'fit') return { x: Math.min(x, y), y: Math.min(x, y) };
  if (fit === 'center') return { x: 1, y: 1 };
  return { x: Math.max(x, y), y: Math.max(x, y) }; // fill
}

// The part of the image that is on screen and not covered by system UI, in image pixels.
function safeRect(fit, image, screen) {
  const s = drawScale(fit, image, screen);
  const offsetX = (screen.width - image.width * s.x) / 2, offsetY = (screen.height - image.height * s.y) / 2;
  const left = Math.max(0, (screen.insets.left - offsetX) / s.x);
  const top = Math.max(0, (screen.insets.top - offsetY) / s.y);
  const right = Math.min(image.width, (screen.width - screen.insets.right - offsetX) / s.x);
  const bottom = Math.min(image.height, (screen.height - screen.insets.bottom - offsetY) / s.y);
  return { left, top, right, bottom, scale: s };
}

// Output size: never upscale, and never keep more pixels than the largest screen can show.
// "center" shows pixels 1:1, so resizing would change what the user sees.
function outputSize(fit, image, screens) {
  if (fit === 'center' || !screens.length) return { width: image.width, height: image.height };
  const needed = Math.max(...screens.map(screen => {
    const s = drawScale(fit, image, screen);
    return Math.max(s.x, s.y);
  }));
  const ratio = Math.min(1, needed);
  return { width: Math.max(1, Math.round(image.width * ratio)), height: Math.max(1, Math.round(image.height * ratio)) };
}

/**
 * @param {{ width: number, height: number }} image original pixel size
 * @param {object[]} displays Electron Display objects (screen.getAllDisplays()) with `primary` set
 * @param {string} fit 'fill' | 'fit' | 'stretch' | 'center'
 * @returns {{ width, height, right, bottom, fontSize }} output size and the bottom-right text anchor
 */
function creditLayout(image, displays, fit = 'fill') {
  const screens = (displays || []).map(physical).filter(s => s.width > 0 && s.height > 0);
  if (!screens.length) screens.push({ width: 1920, height: 1080, primary: true, insets: { top: 0, left: 0, bottom: 0, right: 0 } });
  const size = outputSize(fit, image, screens);
  // The corner must be visible on every screen, so intersect the safe areas.
  const rects = screens.map(screen => ({ screen, rect: safeRect(fit, size, screen) }));
  let left = Math.max(...rects.map(r => r.rect.left)), top = Math.max(...rects.map(r => r.rect.top));
  let right = Math.min(...rects.map(r => r.rect.right)), bottom = Math.min(...rects.map(r => r.rect.bottom));
  const primary = rects.find(r => r.screen.primary) || rects[0];
  if (right - left < 1 || bottom - top < 1) ({ left, top, right, bottom } = primary.rect);
  // Text size follows the primary screen, converted to image pixels.
  const perScreenPixel = 1 / primary.rect.scale.y;
  const fontSize = Math.max(10, Math.round(primary.screen.height * FONT_RATIO * perScreenPixel));
  const margin = Math.round(primary.screen.height * MARGIN_RATIO * perScreenPixel);
  return {
    width: size.width, height: size.height, fontSize,
    right: Math.round(Math.max(left + fontSize, right - margin)),
    bottom: Math.round(Math.max(top + fontSize, bottom - margin)),
  };
}

// Credit styles are chosen by the user and do not follow the interface language.
function creditStyle(id) {
  return creditStyles.styles.find(s => s.id === id) || creditStyles.styles.find(s => s.id === creditStyles.default);
}
function creditText(style, author) {
  const text = style.template.replace('{author}', String(author).trim());
  return style.uppercase ? text.toUpperCase() : text;
}

// Stable name for the credited copy: changes when the source, text or layout changes.
function creditFileName(photoId, source, text, layout) {
  const hash = crypto.createHash('sha256').update(JSON.stringify([VERSION, source, text, layout])).digest('hex').slice(0, 16);
  return `${photoId}-credit-${hash}.jpg`;
}

module.exports = { creditLayout, creditFileName, creditStyle, creditText, safeRect, drawScale, outputSize, physical };
