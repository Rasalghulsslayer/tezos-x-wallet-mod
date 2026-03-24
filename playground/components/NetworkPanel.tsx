'use client';

import { Activity, Layers } from 'lucide-react';
import { formatBalance } from '@/lib/format';

interface NetworkPanelProps {
  chainId: string | null;
  balance: bigint | null;
}

function Stat({ icon: Icon, label, value, color }: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-4 py-3"
      style={{ background: 'rgba(139, 92, 246, 0.04)', border: '1px solid rgba(139, 92, 246, 0.12)' }}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
        style={{ background: `${color}12`, border: `1px solid ${color}30` }}
      >
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="section-label">{label}</p>
        <p className="mt-0.5 font-mono text-sm font-medium truncate" style={{ color: 'var(--color-text)', fontFamily: 'JetBrains Mono, monospace' }}>
          {value}
        </p>
      </div>
    </div>
  );
}

export function NetworkPanel({ chainId, balance }: NetworkPanelProps) {
  const chainDecimal = chainId ? `${parseInt(chainId, 16)}` : null;

  return (
    <div className="glass rounded-xl p-5 space-y-4">
      <p className="section-label">Network</p>

      <div className="space-y-2">
        <Stat
          icon={Layers}
          label="Chain ID"
          value={chainDecimal ? `${chainId}  (${chainDecimal})` : '—'}
          color="var(--color-accent)"
        />
        <Stat
          icon={Activity}
          label="Balance"
          value={balance !== null ? formatBalance(balance) : '—'}
          color="var(--color-cyan)"
        />
      </div>
    </div>
  );
}
