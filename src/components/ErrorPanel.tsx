import { Copy, X } from 'lucide-react';
import type { Failure } from '../lib/sources';
import { t } from '../i18n';

type Props = { failure: Failure; onClose: () => void; onCopy: () => void };

export default function ErrorPanel({ failure, onClose, onCopy }: Props) {
  return <section className="error-panel" role="alert">
    <div className="error-head">
      <strong>{t('error.failed', { step: failure.step })}</strong>
      <button className="icon-btn" aria-label={t('error.close')} onClick={onClose}><X size={15}/></button>
    </div>
    <p>{failure.message.split('\n')[0]}</p>
    <details>
      <summary>{t('error.details', { time: failure.at })}</summary>
      <pre>{failure.message}</pre>
      <button className="button secondary" onClick={onCopy}><Copy size={14}/>{t('error.copy')}</button>
    </details>
    <small>{t('error.hint')}</small>
  </section>;
}
