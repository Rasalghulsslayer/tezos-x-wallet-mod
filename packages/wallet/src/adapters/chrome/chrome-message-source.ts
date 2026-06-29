/**
 * classifyChromeSender: maps a Chrome MessageSender to the transport-neutral
 * ClassifiedSource the router consumes. This is the only place the
 * sender.url / sender.tab / sender.origin facts and chrome.runtime.getURL are
 * read — the chrome.* coupling stops here and never re-enters core.
 *
 * Called once at the service-worker boundary, before dispatch(). A non-extension
 * shell ships its own classifier (WalletConnect metadata / WebView origin →
 * MessageSource) and calls the same dispatch().
 */

import type { ClassifiedSource } from '../../ports/message-source';

export function classifyChromeSender(sender: chrome.runtime.MessageSender): ClassifiedSource {
  // Order matters: the trusted-UI check is the privileged gate and is decided
  // by URL alone; a tab-bearing own-page sender (rare) is treated as trusted-ui,
  // never as a dApp. A bare runtime.id check would be insufficient here —
  // content scripts share the extension id.
  const ownBase = chrome.runtime.getURL(''); // 'chrome-extension://<id>/'
  if (sender.url != null && sender.url.startsWith(ownBase)) {
    return { channel: 'trusted-ui' };
  }
  // dApp traffic is relayed by the content bridge, which runs in a tab. Carry
  // the browser-attested origin (when present) so the router can match it
  // against the origin stamped into the message envelope.
  if (sender.tab != null) {
    return { channel: 'dapp', verifiedOrigin: sender.origin ?? undefined };
  }
  // Foreign extension id, a bare web-page URL, or any other tab-less non-page
  // sender: no trusted facts to attest.
  return null;
}
