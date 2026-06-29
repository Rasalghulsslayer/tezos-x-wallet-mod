/**
 * MessageSource: the transport-neutral facts the host platform independently
 * verifies about who sent a message and over which channel.
 *
 * It carries NO trust policy — the decision (who may issue what) stays in the
 * router (composition/sw-wiring `dispatch`), where it is exercised once by the
 * sender-guard tests. The host only attests facts it can verify on its own:
 * Chrome populates `tab`/`url`/`origin` on a MessageSender; a WalletConnect
 * transport reads session metadata; a WebView reads the loaded page's origin.
 * The chrome-specific computation lives behind a classifier in adapters/chrome,
 * so chrome.* never re-enters core.
 *
 * Two channels:
 *
 *   'trusted-ui' — the wallet's own first-party UI surface (Chrome: an extension
 *                  page whose URL ⊂ `chrome.runtime.getURL('')`; mobile: the
 *                  in-process app UI). The ONLY channel allowed to issue
 *                  privileged commands (unlock, seed export, approval decisions).
 *
 *   'dapp'       — the untrusted dApp relay channel (Chrome: a content script in
 *                  a tab; mobile: a WalletConnect peer or in-app WebView).
 *                  `verifiedOrigin` is the origin the host independently attests
 *                  for that channel, compared against the envelope's claimed
 *                  origin to catch spoofing. It is `undefined` when the platform
 *                  cannot attest one (mirrors chrome's optional `sender.origin`).
 */
export type MessageSource =
  | { channel: 'trusted-ui' }
  | { channel: 'dapp'; verifiedOrigin: string | undefined };

/**
 * The result of classifying a raw platform sender. `null` means the host could
 * attest no trusted facts at all (a foreign extension id, a web-page URL, a
 * tab-less non-page sender) — the router rejects it.
 */
export type ClassifiedSource = MessageSource | null;
