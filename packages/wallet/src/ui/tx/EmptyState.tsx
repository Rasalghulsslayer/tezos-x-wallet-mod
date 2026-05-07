import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  detail,
  action,
}: {
  icon:    ReactNode;
  title:   string;
  detail:  string;
  action?: { label: string; onClick: () => void; icon?: ReactNode };
}) {
  return (
    <div className="tx-empty-card">
      <div className="tx-empty-icon">{icon}</div>
      <h3 className="tx-empty-title">{title}</h3>
      <p className="tx-empty-detail">{detail}</p>
      {action && (
        <button type="button" className="tx-empty-cta" onClick={action.onClick}>
          {action.icon}
          {action.label}
        </button>
      )}
    </div>
  );
}
