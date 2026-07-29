'use client';

import { useCallback, useMemo, useState } from 'react';
import { WcProvider, WC_PROVIDER_INFO } from '@/lib/walletconnect';

/**
 * Owns the single WcProvider instance and the `wc:` pairing URI it surfaces
 * while a connection proposal is waiting for the mobile wallet. The provider
 * constructor is side-effect-free (the WC SDK loads lazily on first use), so
 * the memo is safe under StrictMode double-invocation.
 */
export function useWalletConnect() {
  const [pairingUri, setPairingUri] = useState<string | null>(null);

  const detail = useMemo<Eip6963ProviderDetail>(
    () => ({ info: WC_PROVIDER_INFO, provider: new WcProvider(setPairingUri) }),
    [],
  );

  const dismissPairing = useCallback(() => setPairingUri(null), []);

  return { detail, pairingUri, dismissPairing };
}
