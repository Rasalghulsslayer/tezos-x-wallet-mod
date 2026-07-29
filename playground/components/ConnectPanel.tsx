'use client';

import { useEffect, useState } from 'react';
import { Loader2, Wallet, LogOut, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WcPairing } from '@/components/WcPairing';
import { formatAddress } from '@/lib/format';
import { toast } from 'sonner';

interface ConnectPanelProps {
  isConnected:  boolean;
  isConnecting: boolean;
  tz1Address:   string | null;
  evmAlias:     string | null;
  activeInfo:   Eip6963ProviderInfo | null;
  providers:    Eip6963ProviderDetail[];
  wcPairingUri: string | null;
  onConnect:    (p?: Eip6963ProviderDetail) => void;
  onDisconnect: () => void;
  onDismissWcPairing: () => void;
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

function ProviderButton({
  detail, disabled, onClick,
}: { detail: Eip6963ProviderDetail; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-all"
      style={{
        background: 'rgba(139, 92, 246, 0.05)',
        border: '1px solid rgba(139, 92, 246, 0.18)',
        color: 'var(--color-foreground)',
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {detail.info.icon !== '' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={detail.info.icon}
          alt={detail.info.name}
          width={22}
          height={22}
          style={{ borderRadius: 6, width: 22, height: 22 }}
        />
      ) : (
        <Wallet className="h-5 w-5" style={{ color: 'var(--color-accent-2)' }} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{detail.info.name}</p>
        <p className="text-[10px] truncate" style={{ color: 'var(--color-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
          {detail.info.rdns}
        </p>
      </div>
    </button>
  );
}

function ConnectSkeleton() {
  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-muted)' }}>
      <Loader2 className="h-3 w-3 animate-spin" />
      Detecting wallets…
    </div>
  );
}

export function ConnectPanel({
  isConnected, isConnecting, tz1Address, evmAlias, activeInfo, providers,
  wcPairingUri, onConnect, onDisconnect, onDismissWcPairing,
}: ConnectPanelProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <div className="glass rounded-xl p-5 space-y-4">
      <p className="section-label">Wallet</p>

      {!isConnected ? (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            Connect any EIP-1193 wallet. Tezos X Wallet exposes both runtimes; other EVM wallets only the 0x side.
          </p>

          {!mounted ? (
            <ConnectSkeleton />
          ) : providers.length === 0 ? (
            <div
              className="rounded-md px-3 py-3 text-xs"
              style={{
                background: 'rgba(255, 184, 76, 0.08)',
                border: '1px solid rgba(255, 184, 76, 0.25)',
                color: 'var(--color-muted)',
              }}
            >
              No wallet detected. Install Tezos X Wallet (or any EIP-1193 wallet) and reload.
            </div>
          ) : (
            <div className="space-y-2">
              {providers.map((p) => (
                <ProviderButton
                  key={p.info.uuid}
                  detail={p}
                  disabled={isConnecting}
                  onClick={() => onConnect(p)}
                />
              ))}
            </div>
          )}

          {wcPairingUri != null && mounted && (
            <WcPairing uri={wcPairingUri} onDismiss={onDismissWcPairing} />
          )}

          {isConnecting && mounted && (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-muted)' }}>
              <Loader2 className="h-3 w-3 animate-spin" />
              Connecting…
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {activeInfo != null && (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-muted)' }}>
              <Wallet className="h-3 w-3" />
              <span>Connected to <strong style={{ color: 'var(--color-foreground)' }}>{activeInfo.name}</strong></span>
            </div>
          )}
          {tz1Address && (
            <CopyRow label="Tezos address" value={tz1Address} color="var(--color-cyan)" />
          )}
          {evmAlias && (
            <CopyRow label={tz1Address != null ? 'EVM alias' : 'EVM address'} value={formatAddress(evmAlias)} color="var(--color-accent-2)" />
          )}
          {tz1Address == null && evmAlias != null && (
            <p className="text-[10px] leading-relaxed" style={{ color: 'var(--color-muted)' }}>
              This wallet doesn't bridge to Tezos. Switch to Tezos X Wallet for a tz1 + EVM alias pair.
            </p>
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
