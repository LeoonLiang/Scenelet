const { test } = require('node:test');
const assert = require('node:assert/strict');
const { creditLayout, creditFileName, creditStyle, creditText, safeRect, outputSize } = require('../electron/credit-layout.cjs');
const creditStyles = require('../electron/credit-styles.json');
const core = require('../electron/core.cjs');

// A 4K screen at 2x with a 25pt menu bar on top and a 70pt Dock at the bottom (macOS style).
const mac = { primary: true, scaleFactor: 2, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 25, width: 1920, height: 985 } };
// A 1080p screen with a 48px taskbar at the bottom (Windows style).
const windows = { primary: true, scaleFactor: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1032 } };
const screen = (width, height, insets = {}) => ({ width, height, insets: { top: 0, left: 0, bottom: 0, right: 0, ...insets } });

test('fill: credit sits inside the cropped area, above the Dock', () => {
  // 3:2 photo on a 16:9 screen: top and bottom are cropped away by "fill".
  const layout = creditLayout({ width: 6000, height: 4000 }, [mac], 'fill');
  assert.deepEqual([layout.width, layout.height], [3840, 2560]); // downscaled to what the screen shows
  const croppedTop = (2560 - 2160) / 2; // 200 image px hidden above and below
  const visibleBottom = 2560 - croppedTop - 70 * 2; // minus the Dock in physical px
  assert.ok(layout.bottom < visibleBottom, `${layout.bottom} should be above ${visibleBottom}`);
  assert.ok(layout.bottom > visibleBottom - 100);
  assert.ok(layout.right < 3840 && layout.right > 3840 - 100);
  assert.equal(layout.fontSize, Math.round(2160 * 0.0125));
});

test('fill: tall crop keeps the credit away from the cut-off sides', () => {
  // A portrait photo filling a landscape screen loses most of its height, not width.
  const layout = creditLayout({ width: 3000, height: 4000 }, [windows], 'fill');
  assert.equal(layout.width, 1920); // scaled so width matches the screen
  const scale = 1920 / 3000;
  const visibleBottom = (4000 * scale + 1080) / 2 - 48;
  assert.ok(layout.bottom < visibleBottom && layout.bottom > visibleBottom - 60);
});

test('fit: credit follows the image corner inside the letterbox', () => {
  const layout = creditLayout({ width: 4000, height: 4000 }, [windows], 'fit');
  assert.deepEqual([layout.width, layout.height], [1080, 1080]);
  // Square image on a wide screen: the right edge is the image edge, not the screen edge.
  assert.ok(layout.right < 1080);
  // The image reaches the screen bottom, so the taskbar still has to be avoided.
  assert.ok(layout.bottom < 1080 - 48);
});

test('center keeps original pixels and never upscales', () => {
  assert.deepEqual(outputSize('center', { width: 1200, height: 800 }, [screen(3840, 2160)]), { width: 1200, height: 800 });
  assert.deepEqual(outputSize('fill', { width: 1200, height: 800 }, [screen(3840, 2160)]), { width: 1200, height: 800 });
  const layout = creditLayout({ width: 5000, height: 3000 }, [windows], 'center');
  // Only the middle 1920x1080 is visible; the credit must be inside it.
  assert.ok(layout.right <= (5000 + 1920) / 2 && layout.right > (5000 + 1920) / 2 - 80);
  assert.ok(layout.bottom <= (3000 + 1080) / 2 - 48);
});

test('stretch maps each axis separately', () => {
  const rect = safeRect('stretch', { width: 1000, height: 1000 }, screen(2000, 1000, { bottom: 100 }));
  assert.equal(rect.right, 1000);
  assert.equal(rect.bottom, 900);
});

test('multiple screens: the corner must be visible on all of them', () => {
  const wide = { ...windows, primary: true };
  const tall = { primary: false, scaleFactor: 1, bounds: { x: 1920, y: 0, width: 1080, height: 1920 }, workArea: { x: 1920, y: 0, width: 1080, height: 1920 } };
  const single = creditLayout({ width: 6000, height: 4000 }, [wide], 'fill');
  const both = creditLayout({ width: 6000, height: 4000 }, [wide, tall], 'fill');
  // The portrait screen crops the sides heavily, so the credit moves inwards.
  assert.ok(single.right / single.width > 0.95);
  // On the 1080px-wide portrait screen only the middle 1080/1920 of the 2880px-wide copy is visible.
  assert.deepEqual([both.width, both.height], [2880, 1920]);
  assert.ok(both.right <= (2880 + 1080) / 2 && both.right > (2880 + 1080) / 2 - 80, String(both.right));
});

test('falls back to a default screen and keeps text on the image', () => {
  const layout = creditLayout({ width: 800, height: 600 }, [], 'fill');
  assert.ok(layout.right > 0 && layout.right <= 800);
  assert.ok(layout.bottom > 0 && layout.bottom <= 600);
  assert.ok(layout.fontSize >= 10);
});

test('credited copy name changes with text and layout, and is a safe file name', () => {
  const layout = creditLayout({ width: 6000, height: 4000 }, [mac], 'fill');
  const a = creditFileName('abc_123', 'src', 'Photo by A on Unsplash', layout);
  assert.match(a, /^abc_123-credit-[0-9a-f]{16}\.jpg$/);
  assert.equal(a, creditFileName('abc_123', 'src', 'Photo by A on Unsplash', layout));
  assert.notEqual(a, creditFileName('abc_123', 'src', 'Photo by B on Unsplash', layout));
  assert.notEqual(a, creditFileName('abc_123', 'src', 'Photo by A on Unsplash', { ...layout, right: layout.right - 1 }));
  assert.notEqual(a, creditFileName('abc_123', 'other', 'Photo by A on Unsplash', layout));
});

test('credit styles format the author independently of the interface language', () => {
  assert.equal(creditText(creditStyle('classic'), ' Jane Doe '), 'Photo by Jane Doe on Unsplash');
  assert.equal(creditText(creditStyle('minimal'), 'Jane Doe'), 'JANE DOE / UNSPLASH');
  assert.equal(creditText(creditStyle('serif'), '林薇'), '林薇 — Unsplash');
  assert.equal(creditText(creditStyle('chinese'), 'Jane Doe'), '摄影 Jane Doe · Unsplash');
  assert.equal(creditStyle('nope').id, creditStyles.default);
  for (const style of creditStyles.styles) assert.ok(style.template.includes('{author}') && style.family && style.scale > 0, style.id);
});

test('credit style setting defaults and validates', () => {
  assert.equal(core.defaults.creditStyle, 'classic');
  assert.equal(core.normalizeSettings({}).creditStyle, 'classic');
  assert.equal(core.normalizeSettings({ creditStyle: 'serif' }).creditStyle, 'serif');
  assert.equal(core.normalizeSettings({ creditStyle: 'comic' }).creditStyle, 'classic');
  assert.equal(core.normalizeSettings({ creditStyle: 'none' }).creditStyle, 'none');
  // Settings saved before styles existed only have `credit: false`; a stale flag next to a style is ignored.
  assert.equal(core.normalizeSettings({ credit: false }).creditStyle, 'none');
  assert.equal(core.normalizeSettings({ credit: false, creditStyle: 'serif' }).creditStyle, 'serif');
  assert.equal('credit' in core.normalizeSettings({ credit: true }), false);
});
