import { useMemo } from 'react';
import type { PendingRequest } from '@/shared/messages';
import { Button } from '../../tx/Button';
import { Line } from '../../tx/Line';
import { truncAddr } from '../../tx/utils';
import { ApprovalHeader } from './ApprovalHeader';
import { ModerateRisk } from './ModerateRisk';
import { PinnedChip } from './PinnedChip';
import { hostnameOf } from './helpers';
import type { AccountContext } from './types';

export function TxView({
  pending, respond, ctx,
}: {
  pending: Extract<PendingRequest, { kind: 'transaction' }>;
  respond: (d: 'approve' | 'reject') => void;
  ctx:     AccountContext | null;
}) {
  const hostname = useMemo(() => hostnameOf(pending.origin), [pending.origin]);

  return (
    <div className="tx-approval">
      <ApprovalHeader hostname={hostname} subtitle="Transaction request" accent="purple" />

      <div className="tx-page-scroll" style={{ padding: 16 }}>
        <PinnedChip ctx={ctx} />
        <div className="tx-kicker" style={{ marginBottom: 6 }}>Requesting</div>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em', marginBottom: 14 }}>
          {pending.methodSig ?? 'Contract call'}
        </div>

        <ModerateRisk msg="Review the recipient and amount before signing." />

        <div className="tx-card" style={{ padding: 0 }}>
          <Line label="To"    value={truncAddr(pending.to, 8)} />
          <div className="tx-divider" />
          <Line label="Value" value={pending.value} />
          <div className="tx-divider" />
          <Line label="Data"  value={pending.data === '0x' ? '(empty)' : truncAddr(pending.data, 10)} />
        </div>
      </div>

      <div className="tx-action-bar" style={{ gap: 8 }}>
        <Button variant="outline" full onClick={() => respond('reject')}>Reject</Button>
        <Button variant="accent"  full onClick={() => respond('approve')}>Approve</Button>
      </div>
    </div>
  );
}
