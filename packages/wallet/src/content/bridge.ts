/**
 * Content script (ISOLATED world). Bidirectional bridge:
 *   page (window.postMessage) ↔ service worker (chrome.runtime.sendMessage).
 *
 * Inbound from page → SW: TEZOSX_WALLET_REQUEST
 * Outbound to page:       TEZOSX_WALLET_RESPONSE, TEZOSX_WALLET_EVENT
 */

import type { EthereumRequest, ContentPush, WalletResponse } from '../shared/messages';

// ── Page → SW ─────────────────────────────────────────────────────────────────

interface PageRequest {
  type:      'TEZOSX_WALLET_REQUEST';
  requestId: string;
  args:      { method: string; params?: readonly unknown[] };
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as PageRequest | undefined;
  if (data == null || data.type !== 'TEZOSX_WALLET_REQUEST') return;

  // The SW-side requestId is minted here, in the ISOLATED world, so the page
  // can never choose (or collide) the key under which the approval queue
  // tracks a request. The page-supplied id is only echoed back in the
  // response envelope below.
  const bgMessage: EthereumRequest = {
    type:      'ETHEREUM_REQUEST',
    origin:    window.location.origin,
    requestId: crypto.randomUUID(),
    args:      data.args,
  };

  chrome.runtime
    .sendMessage(bgMessage)
    .then((response: WalletResponse) => {
      window.postMessage(
        response.ok
          ? {
              type:      'TEZOSX_WALLET_RESPONSE',
              requestId: data.requestId,
              ok:        true,
              result:    response.data,
            }
          : {
              type:      'TEZOSX_WALLET_RESPONSE',
              requestId: data.requestId,
              ok:        false,
              code:      response.code,
              message:   response.message,
            },
        window.location.origin || '*',
      );
    })
    .catch((err: Error) => {
      window.postMessage(
        {
          type:      'TEZOSX_WALLET_RESPONSE',
          requestId: data.requestId,
          ok:        false,
          code:      -32603,
          message:   err.message,
        },
        window.location.origin || '*',
      );
    });
});

// ── SW → Page (push events: accountsChanged, disconnect, …) ──────────────────

chrome.runtime.onMessage.addListener((msg: ContentPush) => {
  if (msg.type === 'PROVIDER_EVENT') {
    window.postMessage(
      { type: 'TEZOSX_WALLET_EVENT', event: msg.event, data: msg.data },
      window.location.origin || '*',
    );
    return;
  }
  if (msg.type === 'WALLET_ROLE') {
    window.postMessage(
      { type: 'TEZOSX_WALLET_ROLE', routesViaRelayer: msg.routesViaRelayer },
      window.location.origin || '*',
    );
    return;
  }
});

console.info('[TezosX Wallet] content bridge loaded');
