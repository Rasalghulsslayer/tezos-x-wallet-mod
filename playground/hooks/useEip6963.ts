'use client';

import { useEffect, useState } from 'react';

export function useEip6963(): Eip6963ProviderDetail[] {
  const [providers, setProviders] = useState<Eip6963ProviderDetail[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onAnnounce = (e: Eip6963AnnounceEvent) => {
      const detail = e.detail;
      setProviders((prev) => {
        if (prev.some((p) => p.info.uuid === detail.info.uuid)) return prev;
        return [...prev, detail];
      });
    };

    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    return () => window.removeEventListener('eip6963:announceProvider', onAnnounce);
  }, []);

  return providers;
}
