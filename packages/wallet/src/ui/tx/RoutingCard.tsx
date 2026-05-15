import type { DestRuntime } from '@/domain/chain';
import { ChainPill } from './ChainPill';
import { Icon } from './Icon';

type Asset      = 'XTZ' | 'USDC';
type SourceKind = 'tezos' | 'evm';

export function RoutingCard({
  asset,
  dest,
  sourceKind,
}: {
  asset:       Asset;
  dest:        DestRuntime;
  sourceKind:  SourceKind;
}) {
  // USDC only exists on the EVM runtime — block any non-0x destination.
  if (asset === 'USDC' && dest === 'l1') {
    return (
      <Frame tone="warning">
        <Icon name="alert" size={14} color="var(--tx-warning)" />
        <span>USDC only exists on the EVM runtime — enter a 0x address.</span>
      </Frame>
    );
  }

  if (dest === null) {
    return (
      <Frame tone="muted">
        <Icon name="info" size={14} color="var(--tx-fg-subtle)" />
        <span>Routing is auto-detected from the recipient address.</span>
      </Frame>
    );
  }

  if (asset === 'USDC') {
    // Only Tezos-source USDC sends are wired in 0.7.0; the asset selector in
    // Send disables USDC when sourceKind === 'evm', so this branch is the
    // tz1 → 0x ERC-20 cross-runtime path.
    return (
      <Frame tone="cyan">
        <ChainPill chain="l2" />
        <span><strong>ERC-20 transfer</strong> · routed via NAC gateway.</span>
      </Frame>
    );
  }

  // XTZ from here on.
  if (sourceKind === 'tezos') {
    if (dest === 'l1') {
      return (
        <Frame tone="purple">
          <ChainPill chain="l1" />
          <span><strong>Same-runtime transfer</strong> · settles on the Michelson runtime.</span>
        </Frame>
      );
    }
    // tz1 → 0x  (cross-runtime via NAC gateway on L1)
    return (
      <Frame tone="cross">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ChainPill chain="l1" />
          <Icon name="arrow-right" size={12} color="var(--tx-fg-subtle)" />
          <ChainPill chain="l2" />
        </span>
        <span>
          <strong>Cross-runtime transfer</strong> · your tz1 signs, the kernel credits the EVM address (via NAC gateway).
        </span>
      </Frame>
    );
  }

  // sourceKind === 'evm'
  if (dest === 'l2') {
    return (
      <Frame tone="cyan">
        <ChainPill chain="l2" />
        <span><strong>Same-runtime transfer</strong> · settles on the EVM runtime.</span>
      </Frame>
    );
  }
  // 0x → tz1  (cross-runtime via NAC precompile on L2)
  return (
    <Frame tone="cross">
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <ChainPill chain="l2" />
        <Icon name="arrow-right" size={12} color="var(--tx-fg-subtle)" />
        <ChainPill chain="l1" />
      </span>
      <span>
        <strong>Cross-runtime transfer</strong> · your 0x signs, the kernel credits the tz1 (via NAC precompile).
      </span>
    </Frame>
  );
}

type Tone = 'muted' | 'purple' | 'cyan' | 'cross' | 'warning';

function Frame({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const styles: Record<Tone, React.CSSProperties> = {
    muted:   { background: 'var(--tx-surface-2)', color: 'var(--tx-fg-muted)' },
    purple:  { background: 'var(--tx-purple-bg)', color: '#c9bcff' },
    cyan:    { background: 'var(--tx-cyan-bg)',   color: '#a4e6ff' },
    cross:   {
      background: 'linear-gradient(90deg, var(--tx-purple-bg), var(--tx-cyan-bg))',
      color: 'var(--tx-fg)',
    },
    warning: { background: 'var(--tx-warning-bg)', color: 'var(--tx-warning)' },
  };
  return (
    <div
      style={{
        ...styles[tone],
        borderRadius: 'var(--tx-r-md)',
        padding: '10px 12px',
        marginTop: 8,
        fontSize: 11,
        lineHeight: 1.45,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
      {children}
    </div>
  );
}
