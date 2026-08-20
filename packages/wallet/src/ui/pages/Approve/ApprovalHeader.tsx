import { Icon } from '../../tx/Icon';
import { Badge } from '../../tx/Badge';
import { originDisplay } from '@tezosx/wallet-core/shared/approval-display';

export function ApprovalHeader({
  origin, subtitle, accent,
}: {
  origin:   string;
  subtitle: string;
  accent:   'purple' | 'cyan';
}) {
  const { title, secure, favLetter } = originDisplay(origin);
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
      <div className="tx-origin-fav">{favLetter}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflowWrap: 'anywhere' }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--tx-fg-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* A green lock only for https; an insecure origin gets a danger flag
              (and the scheme is spelled out in the title above). */}
          {secure
            ? <Icon name="lock"  size={11} color="var(--tx-success)" />
            : <Icon name="alert" size={11} color="var(--tx-danger)" />}
          <span>{secure ? subtitle : `Insecure origin · ${subtitle}`}</span>
        </div>
      </div>
      <Badge variant={accent}>{accent === 'cyan' ? 'EVM' : 'Michelson'}</Badge>
    </div>
  );
}
