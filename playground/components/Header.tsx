'use client';

import Image from 'next/image';

interface HeaderProps {
  isConnected: boolean;
  chainId: string | null;
}

export function Header({ isConnected, chainId }: HeaderProps) {
  return (
    <header
      className="glass sticky top-0 z-50 flex items-center justify-between px-6 py-4"
      style={{ borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <div
            className="absolute inset-0 rounded-full blur-md opacity-50"
            style={{ background: 'radial-gradient(circle, #8b5cf6, #22d3ee)' }}
          />
          <Image
            src="/tezos-logo.png"
            alt="Tezos"
            width={34}
            height={34}
            className="relative rounded-full"
            onError={() => {}}
          />
        </div>
        <div>
          <h1 className="gradient-text text-lg font-bold tracking-tight leading-none">
            Tezos X Relayer
          </h1>
          <p className="section-label mt-0.5">EIP-1193 Playground</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {chainId && (
          <div
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-mono"
            style={{
              background: 'rgba(34, 211, 238, 0.08)',
              border: '1px solid rgba(34, 211, 238, 0.25)',
              color: 'var(--color-cyan)',
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--color-cyan)', boxShadow: '0 0 6px var(--color-cyan)' }}
            />
            Chain {parseInt(chainId, 16)}
          </div>
        )}

        <div
          className="flex items-center gap-2 rounded-full px-3 py-1 text-xs"
          style={{
            background: isConnected ? 'rgba(0, 255, 136, 0.07)' : 'rgba(255, 51, 85, 0.07)',
            border: `1px solid ${isConnected ? 'rgba(0, 255, 136, 0.25)' : 'rgba(255, 51, 85, 0.25)'}`,
            color: isConnected ? 'var(--color-green)' : 'var(--color-red)',
          }}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'animate-pulse' : ''}`}
            style={{
              background: isConnected ? 'var(--color-green)' : 'var(--color-red)',
              boxShadow: isConnected ? '0 0 6px var(--color-green)' : '0 0 6px var(--color-red)',
            }}
          />
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      </div>
    </header>
  );
}
