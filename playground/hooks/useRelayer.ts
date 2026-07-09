'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useEip6963 } from './useEip6963';
import { useWalletConnect } from './useWalletConnect';

interface RelayerState {
  isConnected:  boolean;
  tz1Address:   string | null;
  evmAlias:     string | null;
  chainId:      string | null;
  isConnecting: boolean;
  activeInfo:   Eip6963ProviderInfo | null;
}

interface TransactionRequest {
  to:     string;
  data?:  string;
  value?: string;
}

const FALLBACK_INFO: Eip6963ProviderInfo = {
  uuid: 'window-ethereum',
  name: 'Browser wallet',
  rdns: 'window.ethereum',
  icon: '',
};

function isMethodNotFound(err: unknown): boolean {
  const e = err as { code?: number; message?: string } | undefined;
  return e?.code === -32601 || (typeof e?.message === 'string' && /method not found|unsupported/i.test(e.message));
}

export function useRelayer() {
  const eip6963Providers = useEip6963();
  const wc = useWalletConnect();

  const providers = useMemo<Eip6963ProviderDetail[]>(() => {
    const list = [...eip6963Providers];
    if (typeof window !== 'undefined' && window.ethereum != null && list.length === 0) {
      list.push({ info: FALLBACK_INFO, provider: window.ethereum });
    }
    // The WalletConnect entry (mobile wallet pairing) comes last, after the
    // window.ethereum fallback check — it is always present, so pushing it
    // earlier would suppress the fallback.
    list.push(wc.detail);
    return list;
  }, [eip6963Providers, wc.detail]);

  const [active, setActive] = useState<EIP1193Provider | null>(null);
  const [state, setState]   = useState<RelayerState>({
    isConnected: false,
    tz1Address:  null,
    evmAlias:    null,
    chainId:     null,
    isConnecting: false,
    activeInfo:  null,
  });

  useEffect(() => {
    if (active == null) return;
    const onAccountsChanged = (...args: unknown[]) => {
      const accs = args[0] as string[];
      if (!accs || accs.length === 0) {
        setActive(null);
        setState({ isConnected: false, tz1Address: null, evmAlias: null, chainId: null, isConnecting: false, activeInfo: null });
      } else {
        setState((s) => ({ ...s, evmAlias: accs[0] }));
      }
    };
    const onChainChanged = (...args: unknown[]) => {
      setState((s) => ({ ...s, chainId: args[0] as string }));
    };
    active.on('accountsChanged', onAccountsChanged);
    active.on('chainChanged',    onChainChanged);
    return () => {
      active.removeListener('accountsChanged', onAccountsChanged);
      active.removeListener('chainChanged',    onChainChanged);
    };
  }, [active]);

  const connect = useCallback(async (detail?: Eip6963ProviderDetail) => {
    const target = detail ?? providers[0];
    if (target == null) {
      toast.error('No wallet detected — install Tezos X Wallet or another EIP-1193 wallet');
      return;
    }
    setState((s) => ({ ...s, isConnecting: true }));
    try {
      const accounts = await target.provider.request({ method: 'eth_requestAccounts' }) as string[];
      const evmAlias = accounts[0] ?? null;

      let tz1Address: string | null = null;
      try {
        const tezAccounts = await target.provider.request({ method: 'tez_getAccounts' }) as string[];
        tz1Address = tezAccounts?.[0] ?? null;
      } catch (e) {
        if (!isMethodNotFound(e)) throw e;
      }

      const chainId = await target.provider.request({ method: 'eth_chainId' }) as string;

      setActive(target.provider);
      setState({ isConnected: true, evmAlias, tz1Address, chainId, isConnecting: false, activeInfo: target.info });
      toast.success(`Connected to ${target.info.name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      toast.error(msg);
      setState((s) => ({ ...s, isConnecting: false }));
    }
  }, [providers]);

  const disconnect = useCallback(async () => {
    if (active != null) {
      try {
        await active.request({ method: 'wallet_revokePermissions' });
      } catch {}
    }
    setActive(null);
    setState({ isConnected: false, tz1Address: null, evmAlias: null, chainId: null, isConnecting: false, activeInfo: null });
    toast.info('Disconnected');
  }, [active]);

  const sendTransaction = useCallback(async (tx: TransactionRequest): Promise<string> => {
    if (active == null) throw new Error('Wallet not connected');
    const hash = await active.request({ method: 'eth_sendTransaction', params: [tx] }) as string;
    return hash;
  }, [active]);

  return {
    ...state,
    providers,
    connect,
    disconnect,
    sendTransaction,
    wcPairingUri: wc.pairingUri,
    dismissWcPairing: wc.dismissPairing,
  };
}
