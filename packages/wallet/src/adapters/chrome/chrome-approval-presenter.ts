/**
 * ChromeApprovalPresenter: presents the approval UI as a chrome.windows popup
 * (approve.html) and confines the chrome.windows coupling here. It owns the
 * single windows.onRemoved listener and maps a user-closed window back to the
 * queue's dismiss callback, so closing the popup with the X rejects the request.
 */

import type { ApprovalPresenter, ApprovalHandle } from '../../ports/approval-presenter';

const APPROVAL_WINDOW = { type: 'popup' as const, width: 420, height: 620 };

export class ChromeApprovalPresenter implements ApprovalPresenter {
  // windowId → the queue's dismiss callback. The global onRemoved listener fans
  // a user-closed window out to the matching callback (treated as a rejection).
  private readonly onDismissByWindow = new Map<number, () => void>();

  constructor() {
    chrome.windows.onRemoved.addListener((windowId) => {
      const onDismiss = this.onDismissByWindow.get(windowId);
      if (onDismiss != null) {
        this.onDismissByWindow.delete(windowId);
        onDismiss();
      }
    });
  }

  async open(requestId: string, onDismiss: () => void): Promise<ApprovalHandle> {
    const url = chrome.runtime.getURL(`approve.html?requestId=${encodeURIComponent(requestId)}`);
    const window = await chrome.windows.create({ url, ...APPROVAL_WINDOW });
    const windowId = window?.id;
    if (windowId != null) this.onDismissByWindow.set(windowId, onDismiss);
    return windowId;
  }

  close(handle: ApprovalHandle): void {
    if (typeof handle !== 'number') return;
    // Drop the mapping first so the resulting onRemoved is a no-op — the
    // decision was already explicit — then close the window (best-effort: the
    // window may already be gone if the user closed it).
    this.onDismissByWindow.delete(handle);
    chrome.windows.remove(handle).catch(() => {});
  }
}
