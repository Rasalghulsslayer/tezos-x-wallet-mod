/**
 * Injected in the page MAIN world at document_start. Exposes a minimal
 * EIP-1193 provider as `window.ethereum` and announces it via EIP-6963.
 *
 * This file runs with zero access to chrome.* APIs. All real logic lives in
 * the service worker; this shim just forwards requests via postMessage to
 * the content bridge (ISOLATED world), which then uses chrome.runtime.sendMessage.
 */

import type { RequestArguments } from '@tezosx/relayer/types';

type Listener = (...args: unknown[]) => void;

// ── Message envelopes (mirror messages.ts without importing it to stay tiny) ──

interface PageRequest {
  type:      'TEZOSX_WALLET_REQUEST';
  requestId: string;
  args:      RequestArguments;
}

interface PageResponse {
  type:      'TEZOSX_WALLET_RESPONSE';
  requestId: string;
  ok:        boolean;
  result?:   unknown;
  code?:     number;
  message?:  string;
}

interface PageEvent {
  type:  'TEZOSX_WALLET_EVENT';
  event: 'accountsChanged' | 'chainChanged' | 'connect' | 'disconnect';
  data:  unknown;
}

// ── Pending request registry ──────────────────────────────────────────────────

type Resolver = { resolve: (v: unknown) => void; reject: (err: Error) => void };
const pending = new Map<string, Resolver>();

function newRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── Provider ──────────────────────────────────────────────────────────────────

class TezosXWalletProvider {
  readonly isMetaMask     = false;
  readonly isTezosXWallet  = true;
  /** Signals that the provider routes EVM calls through the Tezos X NAC
   *  gateway (CRAC). dApps use this to skip "no XTZ on L2" gas checks
   *  since fees are paid on Michelson L1, not on the EVM runtime. */
  readonly isTezosXRelayer = true;

  private readonly listeners = new Map<string, Set<Listener>>();

  async request(args: RequestArguments): Promise<unknown> {
    const requestId = newRequestId();
    const envelope: PageRequest = { type: 'TEZOSX_WALLET_REQUEST', requestId, args };

    return new Promise<unknown>((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      window.postMessage(envelope, window.location.origin || '*');
    });
  }

  on(event: string, listener: Listener): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }

  removeListener(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  // EventEmitter-compatible dispatch used by the page-side receive loop.
  emit(event: string, ...args: unknown[]): boolean {
    const set = this.listeners.get(event);
    if (set == null || set.size === 0) return false;
    for (const fn of set) fn(...args);
    return true;
  }
}

// ── Receive loop for responses + events from the content bridge ──────────────

const provider = new TezosXWalletProvider();

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as PageResponse | PageEvent | undefined;
  if (data == null || typeof data !== 'object') return;

  if (data.type === 'TEZOSX_WALLET_RESPONSE') {
    const res = pending.get(data.requestId);
    if (res == null) return;
    pending.delete(data.requestId);

    if (data.ok) res.resolve(data.result);
    else {
      const err = new Error(data.message ?? 'Request failed') as Error & { code?: number };
      err.code = data.code ?? -32603;
      res.reject(err);
    }
    return;
  }

  if (data.type === 'TEZOSX_WALLET_EVENT') {
    provider.emit(data.event, data.data);
    return;
  }
});

// ── Install on window + EIP-6963 announcement ────────────────────────────────

declare global {
  interface Window {
    ethereum?: TezosXWalletProvider;
  }
}

try {
  Object.defineProperty(window, 'ethereum', {
    value:        provider,
    writable:     false,
    configurable: false,
  });
} catch {
  window.ethereum = provider;
}

const EIP6963_INFO = {
  uuid: '9a3f7c2e-5d8b-4c1a-a9f2-6e3b8d1c5a4f',
  name: 'TezosX Wallet',
  rdns: 'com.tezosx.wallet',
  icon:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E" +
    "%3Crect width='100' height='100' rx='22' fill='%237c5cff'/%3E" +
    "%3Ctext x='50' y='70' font-size='58' text-anchor='middle' fill='white' font-family='Arial%2C sans-serif' font-weight='bold'%3ET%3C/text%3E" +
    '%3C/svg%3E',
} as const;

function announceProvider(): void {
  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: Object.freeze({ info: EIP6963_INFO, provider }),
    }),
  );
}
announceProvider();
window.addEventListener('eip6963:requestProvider', announceProvider);

// Legacy signal for older wallet discovery libraries (wagmi v1, ethers.js).
window.dispatchEvent(new CustomEvent('ethereum#initialized'));

console.info('[TezosX Wallet] window.ethereum injected ✓');
