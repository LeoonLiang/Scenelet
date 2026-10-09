export type DisplaySize = { width: number; height: number };

const valid = (size?: DisplaySize): size is DisplaySize => !!size && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0;

export function displaySize(screen?: DisplaySize, fallback?: DisplaySize): DisplaySize {
  const size = valid(screen) ? screen : valid(fallback) ? fallback : { width: 1920, height: 1080 };
  return { width: size.width, height: size.height };
}

export function previewFit(fit: string, platform?: string) {
  // macOS leaves layout to the system; Fill is the same assumption used for credits.
  return platform !== 'darwin' && (fit === 'fit' || fit === 'stretch' || fit === 'center') ? fit : 'fill';
}

export function wallpaperImageSize(photo: DisplaySize & { source?: string }, downloadWidth?: number): DisplaySize {
  const image = displaySize(photo);
  if (photo.source !== 'unsplash' || !downloadWidth || !Number.isFinite(downloadWidth) || downloadWidth <= 0) return image;
  const scale = Math.min(1, downloadWidth / image.width);
  return { width: Math.round(image.width * scale), height: Math.round(image.height * scale) };
}

// Image dimensions as percentages of the simulated display. Center uses physical
// pixels so a small image stays small even on a high-DPI monitor.
export function wallpaperPlacement(photo: DisplaySize, screen: DisplaySize, fit: string): DisplaySize {
  const display = displaySize(screen), image = displaySize(photo, display);
  if (fit === 'stretch') return { width: 100, height: 100 };
  const scale = fit === 'center' ? 1 : fit === 'fit'
    ? Math.min(display.width / image.width, display.height / image.height)
    : Math.max(display.width / image.width, display.height / image.height);
  return { width: image.width * scale / display.width * 100, height: image.height * scale / display.height * 100 };
}
