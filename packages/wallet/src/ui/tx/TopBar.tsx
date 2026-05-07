import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function TopBar({
  title,
  onBack,
  right,
  center,
  left,
}: {
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
  center?: ReactNode;
  left?: ReactNode;
}) {
  return (
    <div className="tx-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {onBack && (
          <button className="tx-topbar-back" onClick={onBack} aria-label="Back">
            <Icon name="arrow-left" size={18} />
          </button>
        )}
        {left ?? <span className="tx-topbar-title">{title ?? ''}</span>}
      </div>
      {center}
      <div style={{ display: 'flex', gap: 4 }}>{right}</div>
    </div>
  );
}
