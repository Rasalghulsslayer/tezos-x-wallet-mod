/**
 * ChromeUiPorts: registry of the long-lived ports wallet views (popup / side
 * panel) open on mount. It answers the one question the approval presenter
 * needs — "is a trusted wallet view visible right now?" — and doubles as the
 * push channel to those views (PENDING_CHANGED). Confines the
 * chrome.runtime.onConnect coupling here.
 */

import { UI_PORT_NAME, type UiPortPush, type UiPortViewMessage } from '@tezosx/wallet-core/shared/messages';

export class ChromeUiPorts {
  private readonly visibleByPort = new Map<chrome.runtime.Port, boolean>();
  private onAllDisconnected: (() => void) | null = null;

  constructor() {
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name !== UI_PORT_NAME) return;
      // Only extension pages are trusted views — a compromised content script
      // could otherwise fake presence and reroute approvals away from the
      // guarded approve.html window.
      const url = port.sender?.url ?? '';
      if (!url.startsWith(chrome.runtime.getURL(''))) return;

      // A port counts as a view only once it reports itself visible: a wallet
      // in a background tab or a minimized window must not capture approvals
      // the user cannot see (they would render nowhere and be rejected
      // unseen when that window closes).
      this.visibleByPort.set(port, false);
      port.onMessage.addListener((msg: unknown) => {
        const m = msg as UiPortViewMessage | null;
        if (m?.type === 'VIEW_VISIBILITY') this.visibleByPort.set(port, m.visible);
      });
      port.onDisconnect.addListener(() => {
        this.visibleByPort.delete(port);
        if (this.visibleByPort.size === 0) this.onAllDisconnected?.();
      });
    });
  }

  hasOpenView(): boolean {
    for (const visible of this.visibleByPort.values()) {
      if (visible) return true;
    }
    return false;
  }

  broadcast(push: UiPortPush): void {
    // All connected views, visible or not — a hidden view must still clear or
    // advance its overlay so it is current when it becomes visible again.
    for (const port of this.visibleByPort.keys()) {
      try { port.postMessage(push); } catch { /* view gone mid-post */ }
    }
  }

  /** Invoked when the last wallet view closes — the presenter uses it to
   *  treat still-visible in-view approvals like a closed approval window. */
  setOnAllDisconnected(cb: () => void): void {
    this.onAllDisconnected = cb;
  }
}
