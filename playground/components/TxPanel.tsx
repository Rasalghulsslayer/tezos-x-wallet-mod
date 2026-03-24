'use client';

import { CheckCircle2, Clock, XCircle, Terminal } from 'lucide-react';
import { formatTxHash } from '@/lib/format';
import { toast } from 'sonner';

export type TxStatus = 'pending' | 'confirmed' | 'failed';

export interface TxEntry {
  id: string;
  label: string;
  hash: string;
  status: TxStatus;
  timestamp: number;
}

interface TxPanelProps {
  transactions: TxEntry[];
}

const statusConfig: Record<TxStatus, { icon: React.ElementType; color: string; bg: string; border: string }> = {
  pending:   { icon: Clock,         color: '#f97316', bg: 'rgba(249,115,22,0.08)',   border: 'rgba(249,115,22,0.25)' },
  confirmed: { icon: CheckCircle2,  color: '#00ff88', bg: 'rgba(0,255,136,0.07)',    border: 'rgba(0,255,136,0.2)' },
  failed:    { icon: XCircle,       color: '#ff3355', bg: 'rgba(255,51,85,0.07)',    border: 'rgba(255,51,85,0.2)' },
};

export function TxPanel({ transactions }: TxPanelProps) {
  return (
    <div className="glass rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Terminal className="h-3.5 w-3.5" style={{ color: 'var(--color-accent)' }} />
        <p className="section-label">Transaction Log</p>
        {transactions.length > 0 && (
          <span
            className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(139, 92, 246, 0.12)',
              border: '1px solid rgba(139, 92, 246, 0.2)',
              color: 'var(--color-accent-2)',
            }}
          >
            {transactions.length}
          </span>
        )}
      </div>

      {transactions.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-xl py-8 gap-2"
          style={{ background: 'rgba(139, 92, 246, 0.03)', border: '1px dashed rgba(139, 92, 246, 0.15)' }}
        >
          <Terminal className="h-6 w-6 opacity-20" style={{ color: 'var(--color-accent)' }} />
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>No transactions yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {[...transactions].reverse().map((tx, i) => {
            const cfg = statusConfig[tx.status];
            const Icon = cfg.icon;
            const time = new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            return (
              <div
                key={tx.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all"
                style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
              >
                {/* Index */}
                <span
                  className="shrink-0 text-xs font-mono w-5 text-right opacity-40"
                  style={{ color: 'var(--color-muted)', fontFamily: 'JetBrains Mono, monospace' }}
                >
                  {transactions.length - i}
                </span>

                {/* Status icon */}
                <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: cfg.color }} />

                {/* Label */}
                <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                  {tx.label}
                </span>

                {/* Hash (clickable) */}
                <button
                  className="ml-auto font-mono text-xs transition-colors hover:opacity-80"
                  style={{ color: 'var(--color-muted)', fontFamily: 'JetBrains Mono, monospace' }}
                  onClick={() => { navigator.clipboard.writeText(tx.hash); toast.success('Hash copied!'); }}
                  title="Click to copy"
                >
                  {formatTxHash(tx.hash)}
                </button>

                {/* Time */}
                <span
                  className="shrink-0 text-xs font-mono opacity-40"
                  style={{ color: 'var(--color-muted)', fontFamily: 'JetBrains Mono, monospace' }}
                >
                  {time}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
