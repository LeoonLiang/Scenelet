const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const preview = {};
const file = require('node:path').resolve(__dirname, '../src/lib/display-preview.ts');
{
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(output, { exports: preview });
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} should be ${expected}`);

test('display preview preserves landscape, ultrawide and portrait physical screen dimensions', () => {
  for (const [width, height] of [[2560, 1600], [3440, 1440], [1080, 1920]]) {
    const size = preview.displaySize({ width, height });
    assert.equal(size.width, width); assert.equal(size.height, height);
  }
  assert.equal(preview.displaySize({ width: 0, height: NaN }, { width: 1440, height: 900 }).width, 1440);
  assert.equal(preview.displaySize(undefined, { width: Infinity, height: 0 }).width, 1920);
});

test('fill crops a square photo to cover a widescreen while fit leaves side letterboxing', () => {
  const photo = { width: 2000, height: 2000 }, screen = { width: 1920, height: 1080 };
  const fill = preview.wallpaperPlacement(photo, screen, 'fill');
  near(fill.width, 100); near(fill.height, 177.7777777778);
  const fit = preview.wallpaperPlacement(photo, screen, 'fit');
  near(fit.width, 56.25); near(fit.height, 100);
});

test('portrait displays crop the sides and ultrawide displays crop top and bottom', () => {
  const portrait = preview.wallpaperPlacement({ width: 1920, height: 1080 }, { width: 1080, height: 1920 }, 'fill');
  near(portrait.width, 316.049382716); near(portrait.height, 100);
  const wide = preview.wallpaperPlacement({ width: 1920, height: 1080 }, { width: 3840, height: 1080 }, 'fill');
  near(wide.width, 100); near(wide.height, 200);
});

test('center uses original pixel size relative to the physical display; stretch fills both axes', () => {
  const photo = { width: 960, height: 540 }, screen = { width: 3840, height: 2160 };
  const center = preview.wallpaperPlacement(photo, screen, 'center');
  near(center.width, 25); near(center.height, 25);
  const stretch = preview.wallpaperPlacement({ width: 1000, height: 3000 }, screen, 'stretch');
  near(stretch.width, 100); near(stretch.height, 100);
});

test('remote center previews the resized wallpaper file while local photos retain their original size', () => {
  assert.equal(typeof preview.wallpaperImageSize, 'function');
  const original = { width: 6000, height: 4000 };
  const downloaded = preview.wallpaperImageSize({ ...original, source: 'unsplash' }, 1920);
  assert.equal(downloaded.width, 1920); assert.equal(downloaded.height, 1280);
  const centered = preview.wallpaperPlacement(downloaded, { width: 3840, height: 2160 }, 'center');
  near(centered.width, 50); near(centered.height, 59.2592592593);
  assert.equal(preview.wallpaperImageSize({ ...original, source: 'local' }, 1920).width, 6000);
  assert.equal(preview.wallpaperImageSize({ width: 1000, height: 500, source: 'unsplash' }, 3840).width, 1000, 'fit=max does not upscale');
});

test('macOS preview uses the native pipeline fill assumption instead of the Windows-only setting', () => {
  assert.equal(typeof preview.previewFit, 'function');
  assert.equal(preview.previewFit('center', 'darwin'), 'fill');
  assert.equal(preview.previewFit('center', 'win32'), 'center');
  assert.equal(preview.previewFit('fit', 'web'), 'fit');
});
