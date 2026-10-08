import type { ReactNode } from 'react';

type Props = { title: string; description?: string; actions?: ReactNode };

export default function PageHeader({ title, description, actions }: Props) {
  return <header className="page-header">
    <div>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>;
}
