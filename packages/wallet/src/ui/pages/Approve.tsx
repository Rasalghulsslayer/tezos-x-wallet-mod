import { useEffect, useMemo, useState } from 'react';
import type { PendingRequest } from '@/shared/messages';
import { sendApproveRequest } from '@/shared/messaging';
import { formatError, makeError } from '@/domain/error';
import { Button } from '../tx/Button';
import { Icon } from '../tx/Icon';
import { Badge } from '../tx/Badge';
import { Line } from '../tx/Line';
import { ErrorCard } from '../tx/ErrorCard';
import { truncAddr } from '../tx/utils';

type Stage = 'request' | 'signing' | 'done' | 'error';

/* eslint-disable react-hooks/rules-of-hooks */
export function Approve() {
  if (window.top !== window) {
    return (
      <div className="tx-approval">
        <div className="tx-page-scroll" style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ErrorCard error={makeError('iframe-blocked')} />
        </div>
      </div>
    );
  }

  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [stage,   setStage]   = useState<Stage>('request');
  const [error,   setError]   = useState<unknown>(null);

  const requestId = useMemo(
    () => new URLSearchParams(window.location.search).get('requestId') ?? '',
    [],
  );

  useEffect(() => {
    if (requestId === '') { setError(new Error('Missing requestId')); setStage('error'); return; }
    sendApproveRequest<PendingRequest>({ type: 'GET_PENDING', requestId })
      .then(setPending)
      .catch((e: Error) => { setError(e); setStage('error'); });
  }, [requestId]);

  const respond = async (decision: 'approve' | 'reject') => {
    setStage(decision === 'approve' ? 'signing' : 'done');
    try {
      await sendApproveRequest({ type: 'RESOLVE_PENDING', requestId, decision });
      setStage('done');
      setTimeout(() => window.close(), 900);
    } catch (e) {
      setError(e);
      setStage('error');
    }
  };

  if (stage === 'signing') {
    return (
      <div className="tx-approval">
        <div className="tx-topbar"><span className="tx-topbar-title">Signing…</span></div>
        <div className="tx-page-scroll" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 }}>
          <div className="tx-sending" />
          <div style={{ fontSize: 15 }}>Waiting for confirmation</div>
        </div>
      </div>
    );
  }

  if (stage === 'done') {
    return (
      <div className="tx-approval">
        <div className="tx-topbar" />
        <div className="tx-page-scroll" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, textAlign: 'center' }}>
          <div className="tx-success-burst">
            <Icon name="check" size={32} color="var(--tx-success)" strokeWidth={2.25} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em' }}>Done</div>
          <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)' }}>You can close this window.</div>
        </div>
      </div>
    );
  }

  if (stage === 'error' || pending == null) {
    return (
      <div className="tx-approval">
        <div className="tx-topbar" />
        <div className="tx-page-scroll" style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {error != null
            ? <ErrorCard error={formatError(error)} />
            : <div className="tx-sending" />
          }
        </div>
        {error != null && (
          <div className="tx-action-bar">
            <Button variant="outline" full onClick={() => window.close()}>Close</Button>
          </div>
        )}
      </div>
    );
  }

  if (pending.kind === 'connect')     return <ConnectView   pending={pending} respond={respond} />;
  if (pending.kind === 'signature')   return <SignatureView pending={pending} respond={respond} />;
  return <TxView pending={pending} respond={respond} />;
}

function ConnectView({
  pending,
  respond,
}: {
  pending: Extract<PendingRequest, { kind: 'connect' }>;
  respond: (d: 'approve' | 'reject') => void;
}) {
  const hostname = useMemo(() => {
    try { return new URL(pending.origin).hostname; }
    catch { return pending.origin; }
  }, [pending.origin]);

  return (
    <div className="tx-approval">
      <ApprovalHeader hostname={hostname} subtitle="Connection request" accent="cyan" />

      <div className="tx-page-scroll" style={{ padding: 16 }}>
        <div className="tx-kicker" style={{ marginBottom: 6 }}>Requesting</div>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em', marginBottom: 14 }}>
          Connect to {hostname}
        </div>

        <div className="tx-risk" style={{ marginBottom: 14 }}>
          <Icon name="shield" size={16} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>Low risk</div>
            <div style={{ fontSize: 11, opacity: 0.9 }}>The site will see your EVM-visible address. You'll approve each transaction individually.</div>
          </div>
          <span className="bars">
            <span className="on" />
            <span />
            <span />
          </span>
        </div>

        <div className="tx-card" style={{ padding: 0 }}>
          <Line label="Origin" value={hostname} />
          <div className="tx-divider" />
          <Line label="Will receive" value="Your 0x address" />
          <div className="tx-divider" />
          <Line label="Can request" value="Transactions (each needs approval)" />
        </div>
      </div>

      <div className="tx-action-bar" style={{ gap: 8 }}>
        <Button variant="outline" full onClick={() => respond('reject')}>Reject</Button>
        <Button variant="accent" full onClick={() => respond('approve')}>Connect</Button>
      </div>
    </div>
  );
}

function TxView({
  pending,
  respond,
}: {
  pending: Extract<PendingRequest, { kind: 'transaction' }>;
  respond: (d: 'approve' | 'reject') => void;
}) {
  const hostname = useMemo(() => {
    try { return new URL(pending.origin).hostname; }
    catch { return pending.origin; }
  }, [pending.origin]);

  return (
    <div className="tx-approval">
      <ApprovalHeader hostname={hostname} subtitle="Transaction request" accent="purple" />

      <div className="tx-page-scroll" style={{ padding: 16 }}>
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

function SignatureView({
  pending,
  respond,
}: {
  pending: Extract<PendingRequest, { kind: 'signature' }>;
  respond: (d: 'approve' | 'reject') => void;
}) {
  const hostname = useMemo(() => {
    try { return new URL(pending.origin).hostname; }
    catch { return pending.origin; }
  }, [pending.origin]);

  const decoded = pending.decoded;

  return (
    <div className="tx-approval">
      <ApprovalHeader hostname={hostname} subtitle="Signature request" accent="cyan" />

      <div className="tx-page-scroll" style={{ padding: 16 }}>
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
            Decoded from hex · the raw payload is still <code>{truncAddr(pending.message, 8)}</code>.
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

function ApprovalHeader({ hostname, subtitle, accent }: { hostname: string; subtitle: string; accent: 'purple' | 'cyan' }) {
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

function ModerateRisk({ msg }: { msg: string }) {
  return (
    <div className="tx-risk med" style={{ marginBottom: 14 }}>
      <Icon name="alert" size={16} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 500 }}>Moderate risk</div>
        <div style={{ fontSize: 11, opacity: 0.9 }}>{msg}</div>
      </div>
      <span className="bars">
        <span className="on" /><span className="on" /><span />
      </span>
    </div>
  );
}
