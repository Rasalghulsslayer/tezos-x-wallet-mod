'use client';

import { Loader2, Wallet, LogOut, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatAddress } from '@/lib/format';
import { toast } from 'sonner';

interface ConnectPanelProps {
  isConnected: boolean;
  isConnecting: boolean;
  tz1Address: string | null;
  evmAlias: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

function CopyRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="space-y-1">
      <p className="section-label">{label}</p>
      <button
        onClick={() => { navigator.clipboard.writeText(value); toast.success('Copied!'); }}
        className="group flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left transition-all"
        style={{ background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.14)' }}
      >
        <span className="text-xs truncate" style={{ color, fontFamily: 'JetBrains Mono, monospace' }}>
          {value}
        </span>
        <Copy className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-50 transition-opacity" style={{ color }} />
      </button>
    </div>
  );
}

export function ConnectPanel({
  isConnected, isConnecting, tz1Address, evmAlias, onConnect, onDisconnect,
}: ConnectPanelProps) {
  return (
    <div className="glass rounded-xl p-5 space-y-4">
      <p className="section-label">Wallet</p>

      {!isConnected ? (
        <div className="space-y-4">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            Connect Temple Wallet to interact with Tezos X testnet via EIP-1193.
          </p>
          <Button
            onClick={onConnect}
            disabled={isConnecting}
            className="w-full font-semibold"
            style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.9), rgba(109,40,217,0.9))',
              border: '1px solid rgba(139, 92, 246, 0.4)',
              color: '#fff',
              boxShadow: '0 0 24px rgba(139, 92, 246, 0.35)',
            }}
          >
            {isConnecting
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Connecting…</>
              : <><Wallet className="mr-2 h-4 w-4" />Connect Temple</>}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {tz1Address && (
            <CopyRow label="Tezos address" value={tz1Address} color="var(--color-cyan)" />
          )}
          {evmAlias && (
            <CopyRow label="EVM alias" value={formatAddress(evmAlias)} color="var(--color-accent-2)" />
          )}
          <Button
            onClick={onDisconnect}
            variant="outline"
            size="sm"
            className="w-full text-xs"
            style={{
              background: 'rgba(255, 51, 85, 0.05)',
              border: '1px solid rgba(255, 51, 85, 0.2)',
              color: 'var(--color-red)',
            }}
          >
            <LogOut className="mr-2 h-3 w-3" />Disconnect
          </Button>
        </div>
      )}
    </div>
  );
}
