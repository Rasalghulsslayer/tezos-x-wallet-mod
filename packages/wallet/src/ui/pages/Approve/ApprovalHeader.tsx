import { Icon } from '../../tx/Icon';
import { Badge } from '../../tx/Badge';

export function ApprovalHeader({
  hostname, subtitle, accent,
}: {
  hostname: string;
  subtitle: string;
  accent:   'purple' | 'cyan';
}) {
  return (
    <div
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--tx-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div className="tx-origin-fav">{hostname.charAt(0).toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{hostname}</div>
        <div style={{ fontSize: 11, color: 'var(--tx-fg-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="lock" size={11} color="var(--tx-success)" />
          <span>{subtitle}</span>
        </div>
      </div>
      <Badge variant={accent}>{accent === 'cyan' ? 'L2' : 'L1'}</Badge>
    </div>
  );
}
