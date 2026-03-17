'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

interface RelayerState {
  isConnected: boolean;
  tz1Address: string | null;
  evmAlias: string | null;
  chainId: string | null;
  isConnecting: boolean;
}

interface TransactionRequest {
  to: string;
  data?: string;
  value?: string;
}

export function useRelayer() {
  const [state, setState] = useState<RelayerState>({
    isConnected: false,
    tz1Address: null,
    evmAlias: null,
    chainId: null,
    isConnecting: false,
  });

  useEffect(() => {
    const fetchChainId = async () => {
      if (!window.ethereum) return;
      try {
        const id = await window.ethereum.request({ method: 'eth_chainId' }) as string;
        setState(s => ({ ...s, chainId: id }));
      } catch {}
    };

    if (typeof window !== 'undefined' && window.ethereum) {
      fetchChainId();
    } else {
      const onInit = () => fetchChainId();
      window.addEventListener('ethereum#initialized', onInit);
      return () => window.removeEventListener('ethereum#initialized', onInit);
    }
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      toast.error('Relayer not injected — reload the page');
      return;
    }
    setState(s => ({ ...s, isConnecting: true }));
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const evmAlias = accounts[0];

      const tezAccounts = await window.ethereum.request({ method: 'tez_getAccounts' }) as string[];
      const tz1Address = tezAccounts[0] ?? null;

      const chainId = await window.ethereum.request({ method: 'eth_chainId' }) as string;

      setState({ isConnected: true, evmAlias, tz1Address, chainId, isConnecting: false });
      toast.success('Connected to Temple');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      toast.error(msg);
      setState(s => ({ ...s, isConnecting: false }));
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({ method: 'wallet_revokePermissions' });
    } catch {}
    setState({ isConnected: false, tz1Address: null, evmAlias: null, chainId: null, isConnecting: false });
    toast.info('Disconnected');
  }, []);

  const sendTransaction = useCallback(async (tx: TransactionRequest): Promise<string> => {
    if (!window.ethereum) throw new Error('Wallet not connected');
    const hash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [tx],
    }) as string;
    return hash;
  }, []);

  return { ...state, connect, disconnect, sendTransaction };
}
