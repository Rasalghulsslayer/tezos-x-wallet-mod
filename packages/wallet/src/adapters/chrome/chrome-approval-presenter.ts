/**
 * ChromeApprovalPresenter: presents a dApp approval either inside an open
 * wallet view (popup / side panel — pushed over the UI port, rendered as an
 * in-view overlay) or, when no view is open, as a chrome.windows popup
 * (approve.html). It owns the single windows.onRemoved listener and maps a
 * user-closed window back to the queue's dismiss callback, so closing the
 * popup with the X rejects the request; closing the last wallet view while an
 * in-view approval is showing rejects the same way.
 */

import type { ApprovalPresenter, ApprovalHandle } from '@tezosx/wallet-core/ports/approval-presenter';
import type { ChromeUiPorts } from './chrome-ui-ports';

const APPROVAL_WINDOW = { type: 'popup' as const, width: 420, height: 620 };

type Handle =
  | { kind: 'window'; windowId: number }
  | { kind: 'view';   requestId: string };

export class ChromeApprovalPresenter implements ApprovalPresenter {
  // windowId → the queue's dismiss callback. The global onRemoved listener fans
  // a user-closed window out to the matching callback (treated as a rejection).
  private readonly onDismissByWindow = new Map<number, () => void>();
  // requestId → dismiss callback for approvals presented inside a wallet view.
  private readonly onDismissByView = new Map<string, () => void>();

  constructor(private readonly uiPorts: ChromeUiPorts) {
    chrome.windows.onRemoved.addListener((windowId) => {
      const onDismiss = this.onDismissByWindow.get(windowId);
      if (onDismiss != null) {
        this.onDismissByWindow.delete(windowId);
        onDismiss();
      }
    });
    uiPorts.setOnAllDisconnected(() => {
      // The surface showing these approvals is gone — same semantics as the
      // user closing the approval window: reject what was on screen.
      for (const [requestId, onDismiss] of [...this.onDismissByView]) {
        this.onDismissByView.delete(requestId);
        onDismiss();
      }
    });
  }

  async open(requestId: string, onDismiss: () => void): Promise<ApprovalHandle> {
    if (this.uiPorts.hasOpenView()) {
      this.onDismissByView.set(requestId, onDismiss);
      this.uiPorts.broadcast({ type: 'PENDING_CHANGED' });
      const handle: Handle = { kind: 'view', requestId };
      return handle;
    }
    const url = chrome.runtime.getURL(`approve.html?requestId=${encodeURIComponent(requestId)}`);
    const window = await chrome.windows.create({ url, ...APPROVAL_WINDOW });
    const windowId = window?.id;
    if (windowId != null) this.onDismissByWindow.set(windowId, onDismiss);
    const handle: Handle = { kind: 'window', windowId: windowId ?? -1 };
    return handle;
  }

  close(handle: ApprovalHandle): void {
    const h = handle as Handle | null | undefined;
    if (h == null || typeof h !== 'object') return;
    if (h.kind === 'view') {
      this.onDismissByView.delete(h.requestId);
      // Tell the views the set changed so the overlay clears (or advances to
      // the next pending request).
      this.uiPorts.broadcast({ type: 'PENDING_CHANGED' });
      return;
    }
    // A view opened after the window may be mirroring the same request from
    // LIST_PENDING — let it hear the resolution too.
    this.uiPorts.broadcast({ type: 'PENDING_CHANGED' });
    if (h.windowId < 0) return;
    // Drop the mapping first so the resulting onRemoved is a no-op — the
    // decision was already explicit — then close the window (best-effort: the
    // window may already be gone if the user closed it).
    this.onDismissByWindow.delete(h.windowId);
    chrome.windows.remove(h.windowId).catch(() => {});
  }
}
