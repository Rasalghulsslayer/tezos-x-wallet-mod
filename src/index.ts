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

  const provider = new RelayerProvider();

  // Try to lock window.ethereum so other extensions cannot override it.
  // Falls back to simple assignment if the property is already non-configurable
  // (e.g. Temple extension locked it first).
  try {
    Object.defineProperty(window, 'ethereum', {
      value: provider,
      writable: false,
      configurable: false,
    });
  } catch {
    // Property already non-configurable (another extension got there first).
    // Simple assignment may still work if writable:true was used.
    window.ethereum = provider;
  }

  // Legacy announcement (wagmi v1, ethers.js)
  window.dispatchEvent(new CustomEvent('ethereum#initialized'));

  // EIP-6963: Multiple Injected Provider Discovery
  // dApps using wagmi v2 / RainbowKit / ConnectKit listen for this
  const info = {
    uuid:  '6cfb5e8b-2b9a-4d9f-b8e1-1a2b3c4d5e6f',
    name:  'Tezos X Relayer',
    rdns:  'com.tezosx.relayer',
    icon:  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMzIiIGZpbGw9IiMxYzFlM2YiLz48dGV4dCB4PSIzMiIgeT0iNDIiIGZvbnQtc2l6ZT0iMzIiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM4YjVjZjYiPtm4PC90ZXh0Pjwvc3ZnPg==',
  };

  const announceProvider = () => {
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: Object.freeze({ info, provider }),
      }),
    );
  };

  // Announce immediately
  announceProvider();

  // Re-announce whenever a dApp requests providers (fires when the page initializes wallet discovery)
  window.addEventListener('eip6963:requestProvider', announceProvider);

  console.info('[TezosX Relayer] window.ethereum injected ✓');
}

inject();
