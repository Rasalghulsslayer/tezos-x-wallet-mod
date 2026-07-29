'use client';

import { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/Header';
import { ConnectPanel } from '@/components/ConnectPanel';
import { NetworkPanel } from '@/components/NetworkPanel';
import { CounterPanel } from '@/components/CounterPanel';
import { TransferPanel } from '@/components/TransferPanel';
import { TxPanel, type TxEntry } from '@/components/TxPanel';
import { useRelayer } from '@/hooks/useRelayer';
import { useCounter } from '@/hooks/useCounter';
import { useBalance } from '@/hooks/useBalance';

export default function Home() {
  const relayer = useRelayer();
  const balance = useBalance(relayer.tz1Address, relayer.evmAlias);
  const [transactions, setTransactions] = useState<TxEntry[]>([]);

  const addTx = useCallback((label: string, hash: string) => {
    setTransactions(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      label,
      hash,
      status: 'confirmed',
      timestamp: Date.now(),
    }]);
  }, []);

  const counter = useCounter({
    isConnected: relayer.isConnected,
    sendTransaction: relayer.sendTransaction,
    onTx: addTx,
  });

  useEffect(() => {
    counter.refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen">
      <Header isConnected={relayer.isConnected} chainId={relayer.chainId} />

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        {/* Row 1: Wallet + Network */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ConnectPanel
            isConnected={relayer.isConnected}
            isConnecting={relayer.isConnecting}
            tz1Address={relayer.tz1Address}
            evmAlias={relayer.evmAlias}
            activeInfo={relayer.activeInfo}
            providers={relayer.providers}
            wcPairingUri={relayer.wcPairingUri}
            onConnect={relayer.connect}
            onDisconnect={relayer.disconnect}
            onDismissWcPairing={relayer.dismissWcPairing}
          />
          <NetworkPanel
            chainId={relayer.chainId}
            balance={balance}
          />
        </div>

        {/* HUD divider */}
        <div className="hud-divider" />

        {/* Row 2: Counter */}
        <CounterPanel
          isConnected={relayer.isConnected}
          counterValue={counter.counterValue}
          isLoadingValue={counter.isLoadingValue}
          pendingAction={counter.pendingAction}
          onRefresh={counter.refresh}
          onIncrement={counter.increment}
          onDecrement={counter.decrement}
          onSetNumber={counter.setNumber}
        />

        {/* Row 3: Transfer */}
        <TransferPanel
          isConnected={relayer.isConnected}
          sendTransaction={relayer.sendTransaction}
          onTx={addTx}
        />

        {/* Row 4: TX Log */}
        <TxPanel transactions={transactions} />
      </main>
    </div>
  );
}
