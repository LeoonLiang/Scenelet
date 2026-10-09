import { useEffect, useRef, useState } from 'react';
import { ClipboardPaste, FolderOpen, Link, LoaderCircle, X } from 'lucide-react';
import type { DesktopAPI, Photo } from '../types';
import { t } from '../i18n';
import { friendly } from '../lib/sources';
import PhotoImage from './PhotoImage';

type Props = { initialText: string; api?: DesktopAPI; onClose: () => void; onLocal: () => void; onImport: (photo: Photo) => Promise<void> };

export default function ImportDialog({ initialText, api, onClose, onLocal, onImport }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(initialText);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.showModal();
    return () => { document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  async function resolve() {
    if (busy || !text.trim()) return;
    setBusy(true); setError(''); setPhoto(null);
    try {
      if (!api) throw new Error(t('err.browserOnly'));
      setPhoto(await api.openShared({ text }));
    } catch (e) { setError(friendly(e)); }
    finally { setBusy(false); }
  }
  async function paste() {
    setError('');
    try { setText(await navigator.clipboard.readText()); setPhoto(null); }
    catch { setError(t('import.clipboardError')); }
  }
  async function confirm() {
    if (!photo || busy) return;
    setBusy(true); setError('');
    try { await onImport(photo); }
    catch (e) { setError(friendly(e)); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="import-dialog" aria-labelledby="import-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <header className="import-heading"><div><h2 id="import-title">{t('import.title')}</h2><p>{t('import.description')}</p></div>
      <button className="icon-btn" disabled={busy} onClick={onClose} aria-label={t('preview.close')}><X size={18}/></button>
    </header>
    <button className="import-local" disabled={busy} onClick={onLocal}><FolderOpen size={22}/><span><strong>{t('import.local')}</strong><small>{t('import.localHint')}</small></span></button>
    <form onSubmit={e => { e.preventDefault(); void resolve(); }}>
      <label className="field" htmlFor="wallpaper-link"><span><Link size={15}/>{t('import.link')}</span>
        <textarea id="wallpaper-link" autoFocus={!!initialText} rows={3} value={text} disabled={busy} placeholder={t('import.placeholder')} aria-describedby="import-link-help"
          onChange={e => { setText(e.target.value); setPhoto(null); setError(''); }}/>
      </label>
      <p className="helper" id="import-link-help">{t('import.linkHint')}</p>
      <div className="import-link-actions">
        <button type="button" className="text-button" disabled={busy} onClick={() => void paste()}><ClipboardPaste size={14}/>{t('import.paste')}</button>
        <button type="submit" className="button secondary" disabled={busy || !text.trim()}>{busy ? <LoaderCircle size={15} className="spin"/> : <Link size={15}/>} {t('import.resolve')}</button>
      </div>
    </form>
    {error && <p className="import-error" role="alert">{error}</p>}
    {photo && <section className="import-preview" aria-label={t('import.preview')}>
      <div className="import-image"><PhotoImage src={photo.thumb} alt={photo.title}/></div>
      <h3>{photo.title}</h3><p>{photo.author} · {photo.width} × {photo.height} · Unsplash</p>
      <p className="helper">{t('import.confirmHint')}</p>
      <button className="button primary full-width" disabled={busy} onClick={() => void confirm()}>{busy && <LoaderCircle size={15} className="spin"/>}{t('import.confirm')}</button>
    </section>}
  </dialog>;
}
