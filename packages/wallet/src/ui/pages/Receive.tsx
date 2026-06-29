import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VaultState } from '@tezosx/wallet-core/shared/messages';
import { TopBar } from '../tx/TopBar';
import { QrCode } from '../tx/QrCode';
import { Button } from '../tx/Button';
import { Icon } from '../tx/Icon';
import { toast } from '../tx/Toast';

export function Receive({ state }: { state: VaultState }) {
  const navigate = useNavigate();
  const [runtime, setRuntime] = useState<'l1' | 'l2'>('l1');

  if (state.status !== 'unlocked') return null;

  const isEvm = state.kind === 'evm';
  const addr  = isEvm
    ? state.address
    : runtime === 'l1' ? state.tz1 : state.evmAlias;

  const copy = () => {
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

        <QrCode value={addr} />

        <div style={{ marginTop: 18, textAlign: 'center' }}>
          <div className="tx-kicker" style={{ marginBottom: 6 }}>
            {isEvm
              ? 'EVM address'
              : runtime === 'l1' ? 'tz1 address' : '0x address'}
          </div>
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
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18, width: '100%' }}>
          <Button variant="outline" full leftIcon={<Icon name="copy" size={14} />} onClick={copy}>
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
