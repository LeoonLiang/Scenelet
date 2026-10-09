import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

type Props = { title: string; description?: string; actions?: ReactNode; back?: { label: string; onClick: () => void } };

export default function PageHeader({ title, description, actions, back }: Props) {
  return <header className="page-header">
    <div>
      {back && <button className="text-button page-back" onClick={back.onClick}><ArrowLeft size={14}/>{back.label}</button>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>;
}
