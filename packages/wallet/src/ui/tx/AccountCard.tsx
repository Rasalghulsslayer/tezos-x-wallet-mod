import { Icon } from './Icon';
import { Identicon } from './Identicon';
import { CopyAddr } from './CopyAddr';
import { Badge } from './Badge';
import { truncAddr } from './utils';
import { toast } from './Toast';
import type { AccountCardVM } from '@tezosx/wallet-core/view-models/account-card-vm';

export type AccountVariant = 'split' | 'unified' | 'subtle' | 'toggle' | 'vm';

export function AccountCard({
  variant = 'split',
  tz1,
  eth,
  vm,
  addrLen = 4,
  runtime,
  onRuntime,
  testnet,
}: {
  variant?: AccountVariant;
  tz1?: string;
  eth?: string;
  vm?: AccountCardVM;
  addrLen?: number;
  runtime?: 'l1' | 'l2';
  onRuntime?: (r: 'l1' | 'l2') => void;
  testnet?: boolean;
}) {
  if (variant === 'vm') {
    if (vm == null) throw new Error('AccountCard variant="vm" requires a `vm` prop');
    if (vm.kind === 'evm') {
      const copyAddr = () => {
        void navigator.clipboard.writeText(vm.primary.address);
        toast('EVM address copied');
      };
      return (
        <div className="tx-account-card unified" onClick={copyAddr} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Identicon seed={vm.identitySeed} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Account</div>
              <div style={{ fontSize: 11, color: 'var(--tx-fg-muted)' }}>EVM-native</div>
            </div>
            {testnet && <Badge variant="testnet">Testnet</Badge>}
          </div>
          <div className="addr-row">
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="tx-badge cyan">EVM</span>
              <CopyAddr addr={vm.primary.address} len={addrLen} small />
            </span>
            <Icon name="copy" size={13} color="var(--tx-fg-subtle)" />
          </div>
        </div>
      );
    }
    // Tezos VM — delegate to existing split layout
    tz1     = vm.primary.address;
    eth     = vm.secondary?.address ?? '';
    variant = 'split';
  }

  if (tz1 == null || eth == null) {
    throw new Error('AccountCard requires either `vm` or both `tz1` and `eth` props');
  }
  if (variant === 'unified') {
    return (
      <div className="tx-account-card unified">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Identicon seed={tz1} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Account</div>
            <div style={{ fontSize: 11, color: 'var(--tx-fg-muted)' }}>Dual-runtime</div>
          </div>
          {testnet && <Badge variant="testnet">Testnet</Badge>}
        </div>
        <div className="addr-row">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="tx-badge purple">Michelson</span>
            <CopyAddr addr={tz1} len={addrLen} small />
          </span>
          <Icon name="copy" size={13} color="var(--tx-fg-subtle)" />
        </div>
        <div className="spine" />
        <div className="addr-row">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="tx-badge cyan">EVM</span>
            <CopyAddr addr={eth} len={addrLen} small />
          </span>
          <Icon name="copy" size={13} color="var(--tx-fg-subtle)" />
        </div>
      </div>
    );
  }

  if (variant === 'toggle' && runtime && onRuntime) {
    const addr = runtime === 'l1' ? tz1 : eth;
    return (
      <div className="tx-account-card" style={{ padding: 'var(--tx-sp-4)', display: 'block' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Identicon seed={tz1} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Account</div>
            <div style={{ fontSize: 11, color: 'var(--tx-fg-muted)' }}>
              {runtime === 'l1' ? 'Michelson runtime' : 'EVM runtime'}
            </div>
          </div>
          <div className="tx-runtime-toggle">
            <button className={`l1 ${runtime === 'l1' ? 'on' : ''}`} onClick={() => onRuntime('l1')}>Michelson</button>
            <button className={`l2 ${runtime === 'l2' ? 'on' : ''}`} onClick={() => onRuntime('l2')}>EVM</button>
          </div>
        </div>
        <CopyAddr addr={addr} len={addrLen} />
      </div>
    );
  }

  if (variant === 'subtle') {
    return (
      <div className="tx-account-card subtle">
        <Identicon seed={tz1} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Account</div>
          <CopyAddr addr={tz1} len={addrLen} small />
        </div>
        <Badge variant="cyan">+0x</Badge>
      </div>
    );
  }

  // split (default)
  const copy = (v: string, what: string) => () => {
    void navigator.clipboard.writeText(v);
    toast(`${what} address copied`);
  };
  return (
    <div className="tx-account-card">
      <div className="tx-account-side l1" onClick={copy(tz1, 'tz1')}>
        <div className="label"><span className="dot" />Michelson runtime</div>
        <div className="addr">
          {truncAddr(tz1, addrLen)}
          <Icon name="copy" size={11} color="var(--tx-fg-subtle)" />
        </div>
      </div>
      <div className="tx-account-side l2" onClick={copy(eth, 'EVM')}>
        <div className="label"><span className="dot" />EVM runtime</div>
        <div className="addr">
          {truncAddr(eth, addrLen)}
          <Icon name="copy" size={11} color="var(--tx-fg-subtle)" />
        </div>
      </div>
    </div>
  );
}
