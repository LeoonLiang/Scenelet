import { useEffect, useState, type CSSProperties } from 'react';
import type { Photo } from '../types';
import { displaySize, previewFit, wallpaperImageSize, wallpaperPlacement, type DisplaySize } from '../lib/display-preview';
import { t } from '../i18n';
import PhotoImage from './PhotoImage';

function browserDisplay(): DisplaySize {
  if (typeof window === 'undefined') return displaySize();
  const scale = window.devicePixelRatio || 1;
  return displaySize({ width: Math.round(window.screen.width * scale), height: Math.round(window.screen.height * scale) });
}

type Props = { photo: Photo; screen?: DisplaySize; fit: string; platform?: string; wallpaperWidth?: number };
export default function DesktopPreview({ photo, screen, fit, platform, wallpaperWidth }: Props) {
  const [browserScreen, setBrowserScreen] = useState(browserDisplay);
  useEffect(() => {
    if (screen) return;
    const update = () => setBrowserScreen(browserDisplay());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [screen]);
  const display = displaySize(screen, browserScreen);
  const mode = previewFit(fit, platform);
  const placement = wallpaperPlacement(wallpaperImageSize(photo, wallpaperWidth), display, mode);
  return <figure className="desktop-preview" aria-label={t('batch.desktopPreview')} style={{ '--display-ratio': display.width / display.height } as CSSProperties}>
    <div className="monitor-stage">
      <div className="monitor-device">
        <div className="monitor-frame">
          <div className="monitor-screen" data-screen-width={display.width} data-screen-height={display.height}>
            <PhotoImage src={photo.full} alt={photo.title} style={{ width: `${placement.width}%`, height: `${placement.height}%`, maxWidth: 'none', flexShrink: 0, objectFit: 'fill' }}/>
          </div>
          <div className="monitor-chin" aria-hidden="true"><i/></div>
        </div>
        <div className="monitor-stand" aria-hidden="true"/>
        <div className="monitor-foot" aria-hidden="true"/>
      </div>
    </div>
    <figcaption><span>{t(screen ? 'batch.primaryDisplay' : 'batch.screenPreview')}</span><span>{display.width} × {display.height} · {t(platform === 'darwin' ? 'batch.systemLayout' : `settings.fit.${mode}`)}</span></figcaption>
  </figure>;
}
