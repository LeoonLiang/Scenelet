import { X } from 'lucide-react';

export default function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return <div className="toast" role="status">
    <span>{message}</span>
    <button aria-label="关闭提示" onClick={onClose}><X size={15}/></button>
  </div>;
}
