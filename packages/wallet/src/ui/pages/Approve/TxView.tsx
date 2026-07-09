import { useMemo } from 'react';
import type { PendingRequest } from '@tezosx/wallet-core/shared/messages';
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
  const cross    = pending.crossRuntime;

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

        <div className="tx-kicker" style={{ marginTop: 14, marginBottom: 6 }}>dApp intent</div>
        <div className="tx-card" style={{ padding: 0 }}>
          <Line label="To"    value={truncAddr(pending.to, 8)} />
          <div className="tx-divider" />
          <Line label="Value" value={pending.value} />
          <div className="tx-divider" />
          <Line label="Data"  value={pending.data === '0x' ? '(empty)' : truncAddr(pending.data, 10)} />
        </div>

        {cross != null && (
          <>
            <div className="tx-kicker" style={{ marginTop: 16, marginBottom: 6 }}>
              What you actually sign
            </div>
            <div className="tx-card tx-cross-card" style={{ padding: 0 }}>
              <Line label="Michelson target" value={truncAddr(cross.michelsonTarget, 6)} />
              <div className="tx-divider" />
              <Line label="Entrypoint"       value={cross.entrypoint} />
              {cross.decodedSelector != null && (
                <>
                  <div className="tx-divider" />
                  <Line label="Selector" value={cross.decodedSelector} />
                </>
              )}
              <div className="tx-divider" />
              <Line label="Debit (mutez)"   value={cross.mutezValue} />
            </div>
            <div className="tx-cross-note">
              Your tz1 signs a Michelson-runtime operation that the kernel forwards
              to the EVM runtime — cross-runtime via NAC gateway.
            </div>
          </>
        )}
      </div>

      <div className="tx-action-bar" style={{ gap: 8 }}>
        <Button variant="outline" full onClick={() => respond('reject')}>Reject</Button>
        <Button variant="accent"  full onClick={() => respond('approve')}>Approve</Button>
      </div>
    </div>
  );
}
