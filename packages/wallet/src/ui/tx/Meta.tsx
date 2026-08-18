import { Icon } from './Icon';

/**
 * Meta: a one-line status under a field — live import validity ("Valid · 12
 * words"), password match, a wrong confirm word. Count-based hints teach
 * better than a bare "invalid".
 */
export function Meta({ tone, children }: { tone: 'ok' | 'bad'; children: React.ReactNode }) {
  return (
    <div className={`tx-meta ${tone}`}>
      <Icon name={tone === 'ok' ? 'check' : 'alert'} size={12} strokeWidth={tone === 'ok' ? 2.2 : 1.75} />
      <span>{children}</span>
    </div>
  );
}
