'use client';

import { useState, useEffect } from 'react';

export function useBalance(evmAlias: string | null): bigint | null {
  const [balance, setBalance] = useState<bigint | null>(null);

  useEffect(() => {
    if (!evmAlias || !window.ethereum) {
      setBalance(null);
      return;
    }

    const fetchBalance = async () => {
      try {
        const hex = await window.ethereum!.request({
          method: 'eth_getBalance',
          params: [evmAlias, 'latest'],
        }) as string;
        setBalance(BigInt(hex));
      } catch {}
    };

    fetchBalance();
    const id = setInterval(fetchBalance, 5000);
    return () => clearInterval(id);
  }, [evmAlias]);

  return balance;
}
