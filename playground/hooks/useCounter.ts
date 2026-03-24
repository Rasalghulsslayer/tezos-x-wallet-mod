'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  COUNTER_ADDRESS,
  SELECTORS,
  encodeSetNumber,
  readCounter,
} from '@/lib/counter';
import { formatTxHash } from '@/lib/format';

interface UseCounterOptions {
  isConnected: boolean;
  sendTransaction: (tx: { to: string; data?: string; value?: string }) => Promise<string>;
  onTx: (label: string, hash: string) => void;
}

export function useCounter({ isConnected, sendTransaction, onTx }: UseCounterOptions) {
  const [counterValue, setCounterValue] = useState<bigint | null>(null);
  const [isLoadingValue, setIsLoadingValue] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoadingValue(true);
    try {
      const val = await readCounter();
      setCounterValue(val);
    } catch {
      toast.error('Failed to read counter');
    } finally {
      setIsLoadingValue(false);
    }
  }, []);

  const sendWrite = useCallback(async (label: string, data: string) => {
    if (!isConnected) {
      toast.error('Connect Temple to continue');
      return;
    }
    setPendingAction(label);
    try {
      const hash = await sendTransaction({ to: COUNTER_ADDRESS, data, value: '0x0' });
      onTx(label, hash);
      toast.success(`${label} sent — ${formatTxHash(hash)}`, {
        action: { label: 'Copy', onClick: () => navigator.clipboard.writeText(hash) },
      });
      setTimeout(refresh, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `${label} failed`;
      toast.error(msg);
    } finally {
      setPendingAction(null);
    }
  }, [isConnected, sendTransaction, onTx, refresh]);

  const increment = useCallback(() => sendWrite('increment', SELECTORS.increment), [sendWrite]);
  const decrement = useCallback(() => sendWrite('decrement', SELECTORS.decrement), [sendWrite]);
  const setNumber = useCallback((num: bigint) => sendWrite('setNumber', encodeSetNumber(num)), [sendWrite]);

  return { counterValue, isLoadingValue, pendingAction, refresh, increment, decrement, setNumber };
}
