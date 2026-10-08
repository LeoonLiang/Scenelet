import { useEffect, useState, type CSSProperties } from 'react';
import { t } from '../i18n';

type Props = { src: string; alt: string; eager?: boolean; onOpen?: () => void; style?: CSSProperties };
export default function PhotoImage({ src, alt, eager = true, onOpen, style }: Props) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { setFailed(false); setLoaded(false); setAttempt(0); }, [src]);
  const picture = <img key={`${src}-${attempt}`} src={src} alt={alt} style={style} loading={eager ? 'eager' : 'lazy'} decoding="async" onLoad={() => setLoaded(true)} onError={() => setFailed(true)}/>;
  return <div className="smart-image" aria-busy={!loaded && !failed}>
    {failed ? <div className="image-message"><span>{t('image.failed')}</span><button className="button secondary" onClick={() => { setFailed(false); setLoaded(false); setAttempt(n => n + 1); }}>{t('image.retry')}</button>{onOpen && <button className="button secondary" onClick={onOpen}>{t('image.details')}</button>}</div>
      : <>{!loaded && <span className="image-loading" role="status">{t('gallery.loading')}</span>}{onOpen ? <button className="image-open" aria-label={t('photo.preview', { title: alt })} onClick={onOpen}>{picture}</button> : picture}</>}
  </div>;
}
