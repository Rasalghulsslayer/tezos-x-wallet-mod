import { Icon } from './Icon';
import { Identicon } from './Identicon';
import { CopyAddr } from './CopyAddr';
import { Badge } from './Badge';
import { truncAddr, RESOLVING_EVM_ADDRESS } from './utils';
import { toast } from './Toast';
import type { AccountCardVM } from '@tezosx/wallet-core/view-models/account-card-vm';

export type AccountVariant = 'split' | 'unified' | 'subtle' | 'toggle' | 'vm';

/**
 * Address slot that tolerates a still-resolving face: a null address renders
 * the muted placeholder with no copy affordance, a real one the usual
 * click-to-copy truncation.
 */
function AddrSlot({ addr, len, small }: { addr: string | null; len?: number; small?: boolean }) {
  if (addr == null) {
    return (
      <span style={{ fontSize: small ? 11 : 13, color: 'var(--tx-fg-muted)' }}>
        {RESOLVING_EVM_ADDRESS}
      </span>
    );
  }
  return <CopyAddr addr={addr} len={len} small={small} />;
}

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
  /** null = the address exists but has not resolved yet (EVM alias backfill). */
  tz1?: string | null;
  eth?: string | null;
  vm?: AccountCardVM;
  addrLen?: number;
  runtime?: 'l1' | 'l2';
  onRuntime?: (r: 'l1' | 'l2') => void;
  testnet?: boolean;
}) {
  if (variant === 'vm') {
    if (vm == null) throw new Error('AccountCard variant="vm" requires a `vm` prop');
    if (vm.kind === 'evm') {
      const addr = vm.primary.address;
      const copyAddr = addr == null ? undefined : () => {
        void navigator.clipboard.writeText(addr);
        toast('EVM address copied');
      };
      return (
        <div className="tx-account-card unified" onClick={copyAddr} style={{ cursor: copyAddr != null ? 'pointer' : 'default' }}>
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
              <AddrSlot addr={addr} len={addrLen} small />
            </span>
            {addr != null && <Icon name="copy" size={13} color="var(--tx-fg-subtle)" />}
          </div>
        </div>
      );
    }
    // Tezos VM — delegate to existing split layout. The secondary (alias)
    // face is null until the background backfill resolves it.
    tz1     = vm.primary.address;
    eth     = vm.secondary?.address ?? null;
    variant = 'split';
  }

  // undefined means the caller forgot the prop (misuse); null is a legitimate
  // "still resolving" value and renders the placeholder below.
  if (tz1 === undefined || eth === undefined) {
    throw new Error('AccountCard requires either `vm` or both `tz1` and `eth` props');
  }
  if (variant === 'unified') {
    return (
      <div className="tx-account-card unified">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Identicon seed={tz1 ?? '0'} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Account</div>
            <div style={{ fontSize: 11, color: 'var(--tx-fg-muted)' }}>Dual-runtime</div>
          </div>
          {testnet && <Badge variant="testnet">Testnet</Badge>}
        </div>
        <div className="addr-row">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="tx-badge purple">Michelson</span>
            <AddrSlot addr={tz1} len={addrLen} small />
          </span>
          {tz1 != null && <Icon name="copy" size={13} color="var(--tx-fg-subtle)" />}
        </div>
        <div className="spine" />
        <div className="addr-row">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="tx-badge cyan">EVM</span>
            <AddrSlot addr={eth} len={addrLen} small />
          </span>
          {eth != null && <Icon name="copy" size={13} color="var(--tx-fg-subtle)" />}
        </div>
      </div>
    );
  }

  if (variant === 'toggle' && runtime && onRuntime) {
    const addr = runtime === 'l1' ? tz1 : eth;
    return (
      <div className="tx-account-card" style={{ padding: 'var(--tx-sp-4)', display: 'block' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Identicon seed={tz1 ?? '0'} />
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
        <AddrSlot addr={addr} len={addrLen} />
      </div>
    );
  }

  if (variant === 'subtle') {
    return (
      <div className="tx-account-card subtle">
        <Identicon seed={tz1 ?? '0'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Account</div>
          <AddrSlot addr={tz1} len={addrLen} small />
        </div>
        <Badge variant="cyan">+0x</Badge>
      </div>
    );
  }

  // split (default)
  return (
    <div className="tx-account-card">
      <SplitSide chain="l1" label="Michelson runtime" addr={tz1} what="tz1" len={addrLen} />
      <SplitSide chain="l2" label="EVM runtime" addr={eth} what="EVM" len={addrLen} />
    </div>
  );
}

function SplitSide({ chain, label, addr, what, len }: {
  chain: 'l1' | 'l2';
  label: string;
  addr:  string | null;
  what:  string;
  len:   number;
}) {
  const copy = addr == null ? undefined : () => {
    void navigator.clipboard.writeText(addr);
    toast(`${what} address copied`);
  };
  return (
    <div className={`tx-account-side ${chain}`} onClick={copy} style={copy == null ? { cursor: 'default' } : undefined}>
      <div className="label"><span className="dot" />{label}</div>
      <div className="addr">
        {addr == null
          ? <span style={{ color: 'var(--tx-fg-muted)', fontWeight: 400 }}>{RESOLVING_EVM_ADDRESS}</span>
          : <>
              {truncAddr(addr, len)}
              <Icon name="copy" size={11} color="var(--tx-fg-subtle)" />
            </>}
      </div>
    </div>
  );
}
