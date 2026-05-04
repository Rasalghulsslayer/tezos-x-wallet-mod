import type { ReactNode } from 'react';

type Variant = 'purple' | 'cyan' | 'success' | 'danger' | 'warning' | 'neutral' | 'testnet';

export function Badge({ children, variant = 'neutral' }: { children: ReactNode; variant?: Variant }) {
  return <span className={`tx-badge ${variant}`}>{children}</span>;
}
