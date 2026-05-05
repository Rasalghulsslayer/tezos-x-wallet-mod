import { Icon } from './Icon';
import { Identicon } from './Identicon';
import { CopyAddr } from './CopyAddr';
import { Badge } from './Badge';
import { truncAddr } from './utils';
import { toast } from './Toast';

export type AccountVariant = 'split' | 'unified' | 'subtle' | 'toggle';

export function AccountCard({
  variant = 'split',
  tz1,
  eth,
  addrLen = 4,
  runtime,
  onRuntime,
  testnet,
}: {
  variant?: AccountVariant;
  tz1: string;
  eth: string;
  addrLen?: number;
  runtime?: 'l1' | 'l2';
  onRuntime?: (r: 'l1' | 'l2') => void;
  testnet?: boolean;
}) {
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
            <span className="tx-badge purple">L1</span>
            <CopyAddr addr={tz1} len={addrLen} small />
          </span>
          <Icon name="copy" size={13} color="var(--tx-fg-subtle)" />
        </div>
        <div className="spine" />
        <div className="addr-row">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="tx-badge cyan">L2</span>
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
            <button className={`l1 ${runtime === 'l1' ? 'on' : ''}`} onClick={() => onRuntime('l1')}>L1</button>
            <button className={`l2 ${runtime === 'l2' ? 'on' : ''}`} onClick={() => onRuntime('l2')}>L2</button>
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
        <div className="label"><span className="dot" />Tezos L1</div>
        <div className="addr">
          {truncAddr(tz1, addrLen)}
          <Icon name="copy" size={11} color="var(--tx-fg-subtle)" />
        </div>
      </div>
      <div className="tx-account-side l2" onClick={copy(eth, 'EVM')}>
        <div className="label"><span className="dot" />Tezos L2</div>
        <div className="addr">
          {truncAddr(eth, addrLen)}
          <Icon name="copy" size={11} color="var(--tx-fg-subtle)" />
        </div>
      </div>
    </div>
  );
}
