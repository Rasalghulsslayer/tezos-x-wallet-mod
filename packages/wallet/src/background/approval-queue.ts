import type { PendingRequest } from '../shared/messages';
import type { NotificationPort } from '../ports/notification-port';
import type { ApprovalPresenter, ApprovalHandle } from '../ports/approval-presenter';

type Decision = 'approve' | 'reject';

/** Thrown when a request id is already pending — entries are immutable once
 *  enqueued, so a colliding id can never replace what the approval UI shows. */
export class DuplicateRequestIdError extends Error {
  constructor(requestId: string) {
    super(`Request id already pending: ${requestId}`);
    this.name = 'DuplicateRequestIdError';
  }
}

interface Pending {
  request: PendingRequest;
  resolve: (decision: Decision) => void;
  handle?: ApprovalHandle;
}

/**
 * Tracks dApp requests awaiting user approval. For each new request it asks the
 * ApprovalPresenter to show the approval UI, and resolves the associated promise
 * when the user confirms or rejects from that UI (or dismisses it, which counts
 * as a rejection). The queue logic is platform-neutral; the presenter is the
 * only platform-specific piece.
 */
export class ApprovalQueue {
  private readonly queue = new Map<string, Pending>();

  constructor(
    private readonly notifications: NotificationPort,
    private readonly presenter: ApprovalPresenter,
  ) {}

  /** List pending requests (read by the approval UI to render). */
  list(): PendingRequest[] {
    return Array.from(this.queue.values()).map((p) => p.request);
  }

  /** Find one pending request by id. */
  get(requestId: string): PendingRequest | undefined {
    return this.queue.get(requestId)?.request;
  }

  /**
   * Enqueue a new dApp request and return a promise that resolves with the
   * user's decision. Presents the approval UI for it.
   */
  async enqueue(request: PendingRequest): Promise<Decision> {
    if (this.queue.has(request.requestId)) {
      throw new DuplicateRequestIdError(request.requestId);
    }

    let resolveDecision!: (decision: Decision) => void;
    const decision = new Promise<Decision>((resolve) => { resolveDecision = resolve; });

    // Register the entry before presenting so a near-instant user-dismiss — or
    // an explicit RESOLVE_PENDING — always finds it.
    const entry: Pending = { request, resolve: resolveDecision };
    this.queue.set(request.requestId, entry);
    this.syncBadge();

    try {
      entry.handle = await this.presenter.open(request.requestId, () => {
        this.resolve(request.requestId, 'reject');
      });
    } catch {
      // The approval UI could not be shown — don't leave the request dangling.
      this.resolve(request.requestId, 'reject');
    }
    return decision;
  }

  /**
   * Resolve a pending request from the approval UI. Dismisses the approval
   * surface. Returns true if the request was found.
   */
  resolve(requestId: string, decision: Decision): boolean {
    const pending = this.queue.get(requestId);
    if (pending == null) return false;

    this.queue.delete(requestId);
    pending.resolve(decision);
    this.syncBadge();
    this.presenter.close(pending.handle);
    return true;
  }

  /** Reject every pending request (e.g. on lock). */
  rejectAll(reason: string): void {
    for (const { resolve, handle } of this.queue.values()) {
      resolve('reject');
      this.presenter.close(handle);
    }
    this.queue.clear();
    this.syncBadge();
    console.info('[TezosX Wallet] ApprovalQueue flushed:', reason);
  }

  private syncBadge(): void {
    void this.notifications.setPendingCount(this.queue.size);
  }
}
