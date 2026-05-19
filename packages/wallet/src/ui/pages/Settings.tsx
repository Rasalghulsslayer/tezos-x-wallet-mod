import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VaultState } from '@/shared/messages';
import { sendPopupRequest } from '@/shared/messaging';
import { EVM_EXPLORER, TEZOS_EXPLORER } from '@/shared/constants';
import { formatError } from '@/domain/error';
import { accountCardVM } from '../view-models/account-card-vm';
import { TopBar } from '../tx/TopBar';
import { BottomTabs } from '../tx/BottomTabs';
import { AccountCard } from '../tx/AccountCard';
import { Icon, type IconName } from '../tx/Icon';
import { Button } from '../tx/Button';
import { toast } from '../tx/Toast';
import { ErrorInline } from '../tx/ErrorInline';

type Secret =
  | { kind: 'mnemonic'; value: string }
  | { kind: 'edsk';     value: string }
  | { kind: 'evm-pk';   value: string };

export function Settings({ state, onLock }: { state: VaultState; onLock: () => void }) {
  const navigate        = useNavigate();
  const [modal, setModal] = useState<'reveal' | null>(null);
  const [pwd, setPwd]     = useState('');
  const [secret, setSec]  = useState<Secret | null>(null);
  const [err, setErr]     = useState<unknown>(null);
  const [shown, setShown] = useState(false);
  const [loading, setLd]  = useState(false);

  const reveal = async () => {
    setErr(null);
    setLd(true);
    try {
      const payload = await sendPopupRequest<Secret>({ type: 'EXPORT_SEED', password: pwd });
      setSec(payload);
      setShown(true);
    } catch (e) {
      setErr(e);
    } finally {
      setLd(false);
    }
  };

  const closeModal = () => { setModal(null); setPwd(''); setSec(null); setShown(false); setErr(null); };

  const lock = async () => {
    await sendPopupRequest({ type: 'LOCK' });
    onLock();
    navigate('/unlock', { replace: true });
  };

  if (state.status !== 'unlocked') return null;

  const vm     = accountCardVM(state);
  const isEvm  = state.kind === 'evm';

  return (
    <div className="tx-page">
      <TopBar title="Settings" />

      <div className="tx-page-scroll">
        <div style={{ padding: '12px 16px' }}>
          <AccountCard variant="vm" vm={vm} testnet />
        </div>

        <div className="tx-section-head"><span className="t">Wallet</span></div>
        <LinkRow icon="link" t="Connected sites" onClick={() => navigate('/connections')} />

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
          sub={isEvm ? 'EVM private key' : 'Recovery phrase or private key'}
          onClick={() => setModal('reveal')}
        />
        <LinkRow icon="lock" t="Lock wallet" onClick={lock} />

        <div className="tx-section-head"><span className="t">About</span></div>
        <LinkRow icon="info" t="Version" sub="Wallet v0.8.0 · Relayer v0.5.1" />
        <LinkRow icon="info" t="Network" sub="Tezos X Previewnet" />

        <div style={{ height: 16 }} />
      </div>

      {modal === 'reveal' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 20,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
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
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Reveal secret</div>
            <div style={{ fontSize: 12, color: 'var(--tx-fg-muted)', marginBottom: 16 }}>
              {secret == null
                ? 'Enter your password. Never share your secret.'
                : secret.kind === 'mnemonic' ? 'Your recovery phrase — never share it.'
                : secret.kind === 'edsk'     ? 'Your Tezos secret key — never share it.'
                : 'Your EVM private key — never share it.'}
            </div>

            {secret == null ? (
              <>
                <input
                  className="tx-input"
                  type="password"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  placeholder="Password"
                  autoFocus
                />
                {err != null && (
                  <div style={{ marginTop: 10 }}>
                    <ErrorInline error={formatError(err)} />
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <Button variant="outline" onClick={closeModal}>Cancel</Button>
                  <Button variant="accent" full disabled={loading || pwd.length === 0} onClick={reveal}>
                    {loading ? 'Decrypting…' : 'Reveal'}
                  </Button>
                </div>
              </>
            ) : secret.kind === 'mnemonic' ? (
              <>
                <div
                  className="tx-seed-grid"
                  style={{ filter: shown ? 'none' : 'blur(6px)', transition: 'filter 220ms' }}
                >
                  {secret.value.split(' ').map((w, i) => (
                    <div className="tx-seed-word" key={i}>
                      <span className="n">{i + 1}</span>
                      <span className="w">{w}</span>
                    </div>
                  ))}
                </div>
                <RevealActions
                  shown={shown}
                  onToggle={() => setShown((s) => !s)}
                  value={secret.value}
                />
              </>
            ) : (
              <>
                <div
                  className="tx-mono"
                  style={{
                    background: 'var(--tx-surface-2)',
                    padding: 12,
                    borderRadius: 'var(--tx-r-md)',
                    fontSize: 11,
                    wordBreak: 'break-all',
                    filter: shown ? 'none' : 'blur(6px)',
                    transition: 'filter 220ms',
                  }}
                >
                  {secret.kind === 'evm-pk' ? '0x' + secret.value : secret.value}
                </div>
                <RevealActions
                  shown={shown}
                  onToggle={() => setShown((s) => !s)}
                  value={secret.kind === 'evm-pk' ? '0x' + secret.value : secret.value}
                />
              </>
            )}
          </div>
        </div>
      )}

      <BottomTabs />
    </div>
  );
}

function RevealActions({ shown, onToggle, value }: { shown: boolean; onToggle: () => void; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
      <Button variant="outline" onClick={onToggle}>{shown ? 'Hide' : 'Show'}</Button>
      <Button
        variant="accent"
        full
        onClick={() => {
          void navigator.clipboard.writeText(value);
          toast('Copied');
        }}
      >
        Copy
      </Button>
    </div>
  );
}

function LinkRow({ icon, t, sub, onClick }: { icon: IconName; t: string; sub?: string; onClick?: () => void }) {
  return (
    <div className="tx-link-row" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <span className="i"><Icon name={icon} size={18} /></span>
      <span className="t">
        {t}
        {sub && <div style={{ fontSize: 11, color: 'var(--tx-fg-muted)', marginTop: 2 }}>{sub}</div>}
      </span>
      <span className="c"><Icon name="chevron-right" size={16} /></span>
    </div>
  );
}
