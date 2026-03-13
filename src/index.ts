import { RelayerProvider } from './provider.js';
import type { EIP1193Provider } from './types.js';

declare global {
  interface Window {
    ethereum?: EIP1193Provider & {
      isMetaMask?: boolean;
      isTezosXRelayer?: boolean;
    };
  }
}

function inject(): void {
  if (typeof window === 'undefined') {
    console.warn('[TezosX Relayer] Not in a browser context, skipping injection.');
    return;
  }

  if (window.ethereum != null) {
    console.warn('[TezosX Relayer] window.ethereum already set — overriding with Tezos X Relayer.');
  }

  window.ethereum = new RelayerProvider();

  // EIP-6963-style announcement for dApps that listen for provider discovery
  window.dispatchEvent(new CustomEvent('ethereum#initialized'));

  console.info('[TezosX Relayer] window.ethereum injected ✓');
}

inject();
