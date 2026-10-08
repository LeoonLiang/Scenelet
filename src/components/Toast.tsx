import { X } from 'lucide-react';
import { t } from '../i18n';

export default function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return <div className="toast" role="status">
    <span>{message}</span>
    <button aria-label={t('toast.close')} onClick={onClose}><X size={15}/></button>
  </div>;
}
