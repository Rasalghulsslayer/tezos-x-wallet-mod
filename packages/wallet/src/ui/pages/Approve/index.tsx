/**
 * Approve — dApp request approval popup. Fetches the pending PendingRequest
 * from the SW + the current VaultState (to derive AccountContext for the
 * AccountChip with the active-delta hint). Routes to one of three sub-views
 * per request kind. If the pinned signing account was removed between
 * enqueue and resolution, surfaces a danger card with Close-only.
 */

import { useEffect, useMemo, useState } from 'react';
import type { PendingRequest, VaultState } from '@/shared/messages';
import { sendApproveRequest, sendPopupRequest } from '@/shared/messaging';
import { formatError, makeError } from '@/domain/error';
import { Button } from '../../tx/Button';
import { Icon } from '../../tx/Icon';
import { ErrorCard } from '../../tx/ErrorCard';
import { ConnectView } from './ConnectView';
import { TxView } from './TxView';
import { SignatureView } from './SignatureView';
import type { AccountContext, Stage } from './types';

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
  const [vault,   setVault]   = useState<VaultState | null>(null);
  const [stage,   setStage]   = useState<Stage>('request');
  const [error,   setError]   = useState<unknown>(null);

  const requestId = useMemo(
    () => new URLSearchParams(window.location.search).get('requestId') ?? '',
    [],
  );

  useEffect(() => {
    if (requestId === '') { setError(new Error('Missing requestId')); setStage('error'); return; }
    Promise.all([
      sendApproveRequest<PendingRequest>({ type: 'GET_PENDING', requestId }),
      sendPopupRequest<VaultState>({ type: 'GET_STATE' }),
    ])
      .then(([p, s]) => { setPending(p); setVault(s); })
      .catch((e: Error) => { setError(e); setStage('error'); });
  }, [requestId]);

  const accountContext = useMemo<AccountContext | null>(() => {
    if (pending == null || vault == null || vault.status !== 'unlocked') return null;
    const sorted = vault.accounts.slice().sort((a, b) => a.createdAt - b.createdAt);
    const pinned = sorted.find((a) => a.id === pending.accountId);
    if (pinned == null) return { pinned: null, fallbackLabel: 'Account', currentActive: vault.accountId };
    const idx = sorted.indexOf(pinned);
    return { pinned, fallbackLabel: `Account ${idx + 1}`, currentActive: vault.accountId };
  }, [pending, vault]);

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

  if (accountContext != null && accountContext.pinned == null) {
    return (
      <div className="tx-approval">
        <div className="tx-topbar"><span className="tx-topbar-title">Account removed</span></div>
        <div className="tx-page-scroll" style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ErrorCard error={{
            title:  'Signing account was removed',
            detail: 'The account that initiated this request no longer exists in your vault. Reject and reconnect with a current account.',
            raw:    'pinned-account-missing',
          }} />
        </div>
        <div className="tx-action-bar" style={{ gap: 8 }}>
          <Button variant="outline" full onClick={() => respond('reject')}>Close</Button>
        </div>
      </div>
    );
  }

  if (pending.kind === 'connect')   return <ConnectView   pending={pending} respond={respond} ctx={accountContext} />;
  if (pending.kind === 'signature') return <SignatureView pending={pending} respond={respond} ctx={accountContext} />;
  return <TxView pending={pending} respond={respond} ctx={accountContext} />;
}
