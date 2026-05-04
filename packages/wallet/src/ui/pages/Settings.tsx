import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VaultState } from '@/lib/messages';
import { sendPopupRequest } from '@/lib/messaging';
import { EVM_EXPLORER, TEZOS_EXPLORER } from '@/lib/constants';
import { TopBar } from '../tx/TopBar';
import { BottomTabs } from '../tx/BottomTabs';
import { AccountCard } from '../tx/AccountCard';
import { Icon, type IconName } from '../tx/Icon';
import { Button } from '../tx/Button';
import { toast } from '../tx/Toast';

type Secret = { kind: 'mnemonic' | 'edsk'; value: string } | null;

export function Settings({ state, onLock }: { state: VaultState; onLock: () => void }) {
  const navigate        = useNavigate();
  const [modal, setModal] = useState<'reveal' | null>(null);
  const [pwd, setPwd]     = useState('');
  const [secret, setSec]  = useState<Secret>(null);
  const [err, setErr]     = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [loading, setLd]  = useState(false);

  const reveal = async () => {
    setErr(null);
    setLd(true);
    try {
      const payload = await sendPopupRequest<{ kind: 'mnemonic' | 'edsk'; value: string }>({ type: 'EXPORT_SEED', password: pwd });
      setSec(payload);
      setShown(true);
    } catch (e) {
      setErr((e as Error).message);
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

  return (
    <div className="tx-page">
      <TopBar title="Settings" />

      <div className="tx-page-scroll">
        <div style={{ padding: '12px 16px' }}>
          <AccountCard variant="unified" tz1={state.tz1} eth={state.evmAlias} testnet />
        </div>

        <div className="tx-section-head"><span className="t">Wallet</span></div>
        <LinkRow icon="link" t="Connected sites" onClick={() => navigate('/connections')} />
        <LinkRow
          icon="globe"
          t="Blockscout (EVM)"
          sub="Etherlink L2 explorer"
          onClick={() => { window.open(`${EVM_EXPLORER}/address/${state.evmAlias}`, '_blank'); }}
        />
        <LinkRow
          icon="globe"
          t="tzkt (Tezos L1)"
          sub="Tezos explorer"
          onClick={() => { window.open(`${TEZOS_EXPLORER}/${state.tz1}`, '_blank'); }}
        />

        <div className="tx-section-head"><span className="t">Security</span></div>
        <LinkRow icon="shield" t="Reveal secret" sub="Recovery phrase or private key" onClick={() => setModal('reveal')} />
        <LinkRow icon="lock" t="Lock wallet" onClick={lock} />

        <div className="tx-section-head"><span className="t">About</span></div>
        <LinkRow icon="info" t="Version" sub="Wallet v0.3.0 · Relayer v0.4.0" />
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
                : secret.kind === 'mnemonic'
                  ? 'Your recovery phrase — never share it.'
                  : 'Your Tezos secret key — never share it.'}
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
                {err != null && <p style={{ fontSize: 12, color: 'var(--tx-danger)', marginTop: 10 }}>{err}</p>}
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
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <Button variant="outline" onClick={() => setShown((s) => !s)}>
                    {shown ? 'Hide' : 'Show'}
                  </Button>
                  <Button
                    variant="accent"
                    full
                    onClick={() => {
                      void navigator.clipboard.writeText(secret.value);
                      toast('Copied');
                    }}
                  >
                    Copy
                  </Button>
                </div>
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
                  {secret.value}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <Button variant="outline" onClick={() => setShown((s) => !s)}>
                    {shown ? 'Hide' : 'Show'}
                  </Button>
                  <Button
                    variant="accent"
                    full
                    onClick={() => {
                      void navigator.clipboard.writeText(secret.value);
                      toast('Copied');
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <BottomTabs />
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
