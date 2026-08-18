import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VaultState } from '@tezosx/wallet-core/shared/messages';
import { TopBar } from '../tx/TopBar';
import { QrCode } from '../tx/QrCode';
import { Button } from '../tx/Button';
import { Icon } from '../tx/Icon';
import { toast } from '../tx/Toast';
import { RESOLVING_EVM_ADDRESS } from '../tx/utils';

export function Receive({ state }: { state: VaultState }) {
  const navigate = useNavigate();
  const [runtime, setRuntime] = useState<'l1' | 'l2'>('l1');

  if (state.status !== 'unlocked') return null;

  const isEvm = state.kind === 'evm';
  // null on the EVM tab of a tz1 account while the alias backfill has not
  // landed: the QR and copy affordances are withheld — a placeholder QR would
  // misdirect funds, and there is no address to copy yet.
  const addr: string | null = isEvm
    ? state.address
    : runtime === 'l1' ? state.tz1 : state.evmAlias;

  const copy = () => {
    if (addr == null) return;
    void navigator.clipboard.writeText(addr);
    toast('Address copied');
  };

  return (
    <div className="tx-page">
      <TopBar title="Receive" onBack={() => navigate(-1)} />
      <div className="tx-page-scroll" style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {!isEvm && (
          <div className="tx-runtime-toggle" style={{ marginBottom: 18 }}>
            <button className={`l1 ${runtime === 'l1' ? 'on' : ''}`} onClick={() => setRuntime('l1')}>Michelson runtime</button>
            <button className={`l2 ${runtime === 'l2' ? 'on' : ''}`} onClick={() => setRuntime('l2')}>EVM runtime</button>
          </div>
        )}

        {addr != null ? (
          <QrCode value={addr} />
        ) : (
          <div
            className="tx-qr"
            role="status"
            style={{ background: 'var(--tx-surface-2)' }}
          >
            <span style={{ fontSize: 11, color: 'var(--tx-fg-muted)', textAlign: 'center', padding: '0 12px' }}>
              {RESOLVING_EVM_ADDRESS}
            </span>
          </div>
        )}

        <div style={{ marginTop: 18, textAlign: 'center' }}>
          <div className="tx-kicker" style={{ marginBottom: 6 }}>
            {isEvm
              ? 'EVM address'
              : runtime === 'l1' ? 'tz1 address' : '0x address'}
          </div>
          {addr != null ? (
            <div
              className="tx-mono"
              style={{
                fontSize: 12,
                color: 'var(--tx-fg)',
                wordBreak: 'break-all',
                padding: '0 10px',
                lineHeight: 1.6,
              }}
            >
              {addr}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--tx-fg-muted)', padding: '0 10px', lineHeight: 1.6 }}>
              {RESOLVING_EVM_ADDRESS}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18, width: '100%' }}>
          <Button variant="outline" full disabled={addr == null} leftIcon={<Icon name="copy" size={14} />} onClick={copy}>
            Copy
          </Button>
        </div>

        <div style={{ fontSize: 11, color: 'var(--tx-fg-subtle)', textAlign: 'center', marginTop: 16, lineHeight: 1.55 }}>
          {isEvm
            ? 'Native XTZ and ERC-20 tokens on the EVM runtime can be sent here.'
            : <>Only send {runtime === 'l1' ? 'Tezos-native assets' : 'EVM-side assets'} to this address.<br />Cross-runtime transfers go through the wallet's Send flow.</>}
        </div>
      </div>
    </div>
  );
}
