import { useMemo } from 'react';
import type { PendingRequest } from '@tezosx/wallet-core/shared/messages';
import { Button } from '../../tx/Button';
import { Icon } from '../../tx/Icon';
import { Line } from '../../tx/Line';
import { ApprovalHeader } from './ApprovalHeader';
import { PinnedChip } from './PinnedChip';
import { originDisplay } from '@tezosx/wallet-core/shared/approval-display';
import type { AccountContext } from './types';

export function ConnectView({
  pending, respond, ctx,
}: {
  pending: Extract<PendingRequest, { kind: 'connect' }>;
  respond: (d: 'approve' | 'reject') => void;
  ctx:     AccountContext | null;
}) {
  const hostname = useMemo(() => originDisplay(pending.origin).title, [pending.origin]);

  // A Beacon dApp receives the tz1 and its public key; an EIP-1193 one receives
  // the account's EVM alias. Saying "your 0x address" for a Beacon connection
  // would name an address the site never sees.
  const beacon = pending.protocol === 'beacon';

  return (
    <div className="tx-approval">
      <ApprovalHeader origin={pending.origin} subtitle="Connection request" accent="cyan" />

      <div className="tx-page-scroll" style={{ padding: 16 }}>
        <PinnedChip ctx={ctx} />
        <div className="tx-kicker" style={{ marginBottom: 6 }}>Requesting</div>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em', marginBottom: 14 }}>
          Connect to {hostname}
        </div>

        <div className="tx-risk" style={{ marginBottom: 14 }}>
          <Icon name="shield" size={16} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>Low risk</div>
            <div style={{ fontSize: 11, opacity: 0.9 }}>
              {beacon
                ? "The site will see your Tezos address and its public key. You'll approve each operation individually."
                : "The site will see your EVM-visible address. You'll approve each transaction individually."}
            </div>
          </div>
          <span className="bars">
            <span className="on" /><span /><span />
          </span>
        </div>

        <div className="tx-card" style={{ padding: 0 }}>
          <Line label="Origin" value={pending.origin} />
          <div className="tx-divider" />
          <Line label="Will receive" value={beacon ? 'Your tz1 address + public key' : 'Your 0x address'} />
          <div className="tx-divider" />
          <Line label="Can request" value={beacon ? 'Tezos operations (each needs approval)' : 'Transactions (each needs approval)'} />
        </div>
      </div>

      <div className="tx-action-bar" style={{ gap: 8 }}>
        <Button variant="outline" full onClick={() => respond('reject')}>Reject</Button>
        <Button variant="accent"  full onClick={() => respond('approve')}>Connect</Button>
      </div>
    </div>
  );
}
