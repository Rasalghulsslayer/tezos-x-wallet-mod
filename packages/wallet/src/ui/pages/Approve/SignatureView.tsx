import type { PendingRequest } from '@tezosx/wallet-core/shared/messages';
import { Button } from '../../tx/Button';
import { shortAddr } from '@tezosx/wallet-core/shared/format';
import { ApprovalHeader } from './ApprovalHeader';
import { ModerateRisk } from './ModerateRisk';
import { PinnedChip } from './PinnedChip';
import type { AccountContext } from './types';

export function SignatureView({
  pending, respond, ctx,
}: {
  pending: Extract<PendingRequest, { kind: 'signature' }>;
  respond: (d: 'approve' | 'reject') => void;
  ctx:     AccountContext | null;
}) {
  const decoded  = pending.decoded;

  return (
    <div className="tx-approval">
      <ApprovalHeader origin={pending.origin} subtitle="Signature request" accent="cyan" />

      <div className="tx-page-scroll" style={{ padding: 16 }}>
        <PinnedChip ctx={ctx} />
        <div className="tx-kicker" style={{ marginBottom: 6 }}>Requesting</div>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em', marginBottom: 14 }}>
          Sign message
        </div>

        <ModerateRisk msg="The site only gets a signature — no transaction is broadcast." />

        <div className="tx-kicker" style={{ marginBottom: 6 }}>Message</div>
        <div
          className="tx-mono"
          style={{
            background: 'var(--tx-surface-2)',
            padding: 12,
            borderRadius: 'var(--tx-r-md)',
            fontSize: 12,
            wordBreak: 'break-all',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.55,
            maxHeight: 200,
            overflow: 'auto',
          }}
        >
          {decoded ?? pending.message}
        </div>
        {decoded != null && (
          <div style={{ fontSize: 11, color: 'var(--tx-fg-subtle)', marginTop: 6 }}>
            Decoded from hex · the raw payload is still <code>{shortAddr(pending.message, 11, 8)}</code>.
          </div>
        )}
      </div>

      <div className="tx-action-bar" style={{ gap: 8 }}>
        <Button variant="outline" full onClick={() => respond('reject')}>Reject</Button>
        <Button variant="accent"  full onClick={() => respond('approve')}>Sign</Button>
      </div>
    </div>
  );
}
