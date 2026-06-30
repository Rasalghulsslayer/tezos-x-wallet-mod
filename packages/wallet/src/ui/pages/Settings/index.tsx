/**
 * Settings page — modal-driven flows for Reveal Secret (per-account picker)
 * and per-runtime explorer links. Each sub-component (LinkRow, RevealPicker,
 * RevealView, RevealActions) lives in its own file under this folder.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VaultState } from '@tezosx/wallet-core/shared/messages';
import type { AccountId } from '@tezosx/wallet-core/domain/account';
import { sendPopupRequest } from '@/shared/messaging';
import { EVM_EXPLORER, TEZOS_EXPLORER } from '@tezosx/wallet-core/shared/constants';
import { accountCardVM } from '@tezosx/wallet-core/view-models/account-card-vm';
import { TopBar } from '../../tx/TopBar';
import { BottomTabs } from '../../tx/BottomTabs';
import { AccountCard } from '../../tx/AccountCard';
import { LinkRow } from './LinkRow';
import { RevealPicker } from './RevealPicker';
import { RevealView } from './RevealView';
import type { Modal, Secret } from './types';

export function Settings({ state, onLock }: { state: VaultState; onLock: () => void }) {
  const navigate          = useNavigate();
  const [modal, setModal] = useState<Modal>({ kind: 'closed' });
  const [pwd, setPwd]     = useState('');
  const [secret, setSec]  = useState<Secret | null>(null);
  const [err, setErr]     = useState<unknown>(null);
  const [shown, setShown] = useState(false);
  const [loading, setLd]  = useState(false);

  const sortedAccounts = useMemo(
    () => state.status === 'unlocked' ? state.accounts.slice().sort((a, b) => a.createdAt - b.createdAt) : [],
    [state],
  );

  const openReveal = () => {
    if (state.status !== 'unlocked') return;
    if (sortedAccounts.length <= 1) {
      setModal({ kind: 'reveal', accountId: state.accountId });
    } else {
      setModal({ kind: 'picker' });
    }
  };

  const pickAccount = (id: AccountId) => {
    setModal({ kind: 'reveal', accountId: id });
    setPwd(''); setSec(null); setShown(false); setErr(null);
  };

  const reveal = async () => {
    if (modal.kind !== 'reveal') return;
    setErr(null);
    setLd(true);
    try {
      const payload = await sendPopupRequest<Secret>({
        type:      'EXPORT_SEED',
        password:  pwd,
        accountId: modal.accountId,
      });
      setSec(payload);
      setShown(true);
    } catch (e) {
      setErr(e);
    } finally {
      setLd(false);
    }
  };

  const closeModal = () => {
    setModal({ kind: 'closed' });
    setPwd(''); setSec(null); setShown(false); setErr(null);
  };

  const lock = async () => {
    await sendPopupRequest({ type: 'LOCK' });
    onLock();
    navigate('/unlock', { replace: true });
  };

  if (state.status !== 'unlocked') return null;

  const vm     = accountCardVM(state);
  const isEvm  = state.kind === 'evm';
  const revealedAccount = modal.kind === 'reveal'
    ? sortedAccounts.find((a) => a.id === modal.accountId)
    : undefined;

  return (
    <div className="tx-page">
      <TopBar title="Settings" />

      <div className="tx-page-scroll">
        <div style={{ padding: '12px 16px' }}>
          <AccountCard variant="vm" vm={vm} testnet />
        </div>

        <div className="tx-section-head"><span className="t">Wallet</span></div>
        <LinkRow icon="link" t="Connected sites" onClick={() => navigate('/connections')} />
        <LinkRow icon="plus" t="Add account" sub="Create or import another account" onClick={() => navigate('/accounts/add')} />
        <LinkRow icon="wallet" t="Manage tokens" sub="Add or remove custom ERC-20" onClick={() => navigate('/tokens')} />

        {isEvm ? (
          <LinkRow
            icon="globe"
            t="Blockscout (EVM)"
            sub="EVM explorer"
            onClick={() => { window.open(`${EVM_EXPLORER}/address/${state.address}`, '_blank'); }}
          />
        ) : (
          <>
            <LinkRow
              icon="globe"
              t="Blockscout (EVM)"
              sub="EVM explorer · alias"
              onClick={() => { window.open(`${EVM_EXPLORER}/address/${state.evmAlias}`, '_blank'); }}
            />
            <LinkRow
              icon="globe"
              t="tzkt (Michelson runtime)"
              sub="Tezos explorer"
              onClick={() => { window.open(`${TEZOS_EXPLORER}/${state.tz1}`, '_blank'); }}
            />
          </>
        )}

        <div className="tx-section-head"><span className="t">Security</span></div>
        <LinkRow
          icon="shield"
          t="Reveal secret"
          sub={sortedAccounts.length > 1 ? 'Pick an account, then enter your password' : (isEvm ? 'EVM private key' : 'Recovery phrase or private key')}
          onClick={openReveal}
        />
        <LinkRow icon="lock" t="Lock wallet" onClick={lock} />

        <div className="tx-section-head"><span className="t">About</span></div>
        <LinkRow icon="info" t="Version" sub="Wallet v0.11.3 · Relayer v0.5.5" />
        <LinkRow icon="info" t="Network" sub="Tezos X Previewnet" />

        <div style={{ height: 16 }} />
      </div>

      {modal.kind !== 'closed' && (
        <div
          style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.6)', zIndex: 20,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
          onClick={closeModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--tx-surface)',
              border: '1px solid var(--tx-border)',
              borderRadius: 'var(--tx-r-lg) var(--tx-r-lg) 0 0',
              width: '100%',
              padding: 20,
              animation: 'tx-page-in 220ms var(--tx-ease)',
            }}
          >
            {modal.kind === 'picker' && (
              <RevealPicker
                accounts={sortedAccounts}
                onPick={pickAccount}
                onCancel={closeModal}
              />
            )}

            {modal.kind === 'reveal' && (
              <RevealView
                target={revealedAccount}
                pwd={pwd} setPwd={setPwd}
                secret={secret}
                shown={shown} setShown={setShown}
                err={err} loading={loading}
                onBack={sortedAccounts.length > 1 ? () => setModal({ kind: 'picker' }) : undefined}
                onCancel={closeModal}
                onReveal={reveal}
              />
            )}
          </div>
        </div>
      )}

      <BottomTabs />
    </div>
  );
}
