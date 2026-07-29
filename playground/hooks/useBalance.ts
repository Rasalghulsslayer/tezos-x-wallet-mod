'use client';

import { useEffect, useState } from 'react';
import { TEZLINK_EVM_RPC, TZKT_API_BASE } from '@/lib/network';

const REFRESH_MS = 8000;
const MUTEZ_TO_WEI_FACTOR = 1_000_000_000_000n;

async function fetchTz1Balance(tz1: string): Promise<bigint | null> {
  try {
    const res = await fetch(`${TZKT_API_BASE}/v1/accounts/${tz1}/balance`);
    if (!res.ok) return null;
    const mutez = await res.json() as number;
    return BigInt(Math.floor(mutez)) * MUTEZ_TO_WEI_FACTOR;
  } catch {
    return null;
  }
}

// Direct JSON-RPC read: a public balance query needs no wallet, and going
// through an injected provider would break for wallets connected over
// WalletConnect (no window.ethereum).
async function fetchEvmBalance(address: string): Promise<bigint | null> {
  try {
    const res = await fetch(TEZLINK_EVM_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBalance',
        params: [address, 'latest'],
      }),
    });
    const json = await res.json() as { result?: string };
    if (!json.result) return null;
    return BigInt(json.result);
  } catch {
    return null;
  }
}

export function useBalance(tz1Address: string | null, evmAddress: string | null): bigint | null {
  const [balance, setBalance] = useState<bigint | null>(null);

  useEffect(() => {
    if (!tz1Address && !evmAddress) { setBalance(null); return; }

    let cancelled = false;
    const fetchOnce = async () => {
      const next = tz1Address != null
        ? await fetchTz1Balance(tz1Address)
        : evmAddress != null
          ? await fetchEvmBalance(evmAddress)
          : null;
      if (!cancelled) setBalance(next);
    };

    void fetchOnce();
    const id = setInterval(() => void fetchOnce(), REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [tz1Address, evmAddress]);

  return balance;
}
