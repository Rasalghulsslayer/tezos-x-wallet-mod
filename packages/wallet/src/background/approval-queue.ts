import type { PendingRequest } from '../lib/messages';

type Decision = 'approve' | 'reject';

interface Pending {
  request: PendingRequest;
  resolve: (decision: Decision) => void;
  window?: chrome.windows.Window;
}

/**
 * Tracks dApp requests awaiting user approval. Opens an approve.html popup
 * window for each new request and resolves the associated promise when the
 * user confirms or rejects from that UI.
 */
export class ApprovalQueue {
  private readonly queue = new Map<string, Pending>();

  /** List pending requests (read by approve.html to render the UI). */
  list(): PendingRequest[] {
    return Array.from(this.queue.values()).map((p) => p.request);
  }

  /** Find one pending request by id. */
  get(requestId: string): PendingRequest | undefined {
    return this.queue.get(requestId)?.request;
  }

  /**
   * Enqueue a new dApp request and return a promise that resolves with the
   * user's decision. Opens the approve.html window side by side.
   */
  async enqueue(request: PendingRequest): Promise<Decision> {
    const approvalUrl = chrome.runtime.getURL(
      `approve.html?requestId=${encodeURIComponent(request.requestId)}`,
    );
    const window = await chrome.windows.create({
      url:    approvalUrl,
      type:   'popup',
      width:  420,
      height: 620,
    });

    return new Promise<Decision>((resolve) => {
      this.queue.set(request.requestId, {
        request,
        resolve,
        window: window ?? undefined,
      });
    });
  }

  /**
   * Resolve a pending request from the approval UI. Closes the approval
   * window if still open. Returns true if the request was found.
   */
  resolve(requestId: string, decision: Decision): boolean {
    const pending = this.queue.get(requestId);
    if (pending == null) return false;

    this.queue.delete(requestId);
    pending.resolve(decision);

    if (pending.window?.id != null) {
      chrome.windows.remove(pending.window.id).catch(() => {});
    }
    return true;
  }

  /** Reject every pending request (e.g. on lock). */
  rejectAll(reason: string): void {
    for (const { resolve, window } of this.queue.values()) {
      resolve('reject');
      if (window?.id != null) chrome.windows.remove(window.id).catch(() => {});
    }
    this.queue.clear();
    console.info('[TezosX Wallet] ApprovalQueue flushed:', reason);
  }
}
