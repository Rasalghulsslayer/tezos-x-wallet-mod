/**
 * connectUiPort: view-side half of the long-lived UI port. Opening it tells
 * the SW a trusted wallet view exists; the view then reports its visibility
 * (on connect and on every visibilitychange) because only a visible view may
 * capture approvals — one in a background tab or a minimized window must not.
 * The SW pushes PENDING_CHANGED back over the port whenever the
 * pending-approval set changes. MV3 eviction kills the SW side of the port,
 * so the client reconnects on disconnect — otherwise a long-lived side panel
 * would silently lose presence after the first eviction — and replays one
 * onPendingChanged so pushes missed while the port was down aren't lost.
 * Returns a cleanup function that disconnects for good; call it on unmount so
 * presence stays accurate.
 */

import { UI_PORT_NAME, type UiPortPush, type UiPortViewMessage } from '@tezosx/wallet-core/shared/messages';

const RECONNECT_DELAY_MS = 500;

export function connectUiPort(onPendingChanged: () => void): () => void {
  let stopped = false;
  let port: chrome.runtime.Port | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const postVisibility = () => {
    const msg: UiPortViewMessage = {
      type:    'VIEW_VISIBILITY',
      visible: document.visibilityState === 'visible',
    };
    try { port?.postMessage(msg); } catch { /* port mid-reconnect */ }
  };

  const connect = (isReconnect: boolean) => {
    if (stopped) return;
    port = chrome.runtime.connect({ name: UI_PORT_NAME });
    port.onMessage.addListener((msg: unknown) => {
      if ((msg as UiPortPush | null)?.type === 'PENDING_CHANGED') onPendingChanged();
    });
    port.onDisconnect.addListener(() => {
      port = null;
      if (stopped) return;
      retryTimer = setTimeout(() => connect(true), RECONNECT_DELAY_MS);
    });
    postVisibility();
    if (isReconnect) onPendingChanged();
  };

  document.addEventListener('visibilitychange', postVisibility);
  connect(false);

  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', postVisibility);
    if (retryTimer != null) clearTimeout(retryTimer);
    try { port?.disconnect(); } catch { /* SW already dropped it */ }
  };
}
