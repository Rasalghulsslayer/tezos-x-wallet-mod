/**
 * ApprovalQueue is now platform-neutral: it drives an injected ApprovalPresenter
 * instead of chrome.windows directly. These tests pin the queue↔presenter
 * contract — in particular the user-dismiss → reject path that previously lived
 * (untested) in the service worker's windows.onRemoved listener.
 */

import { describe, it, expect } from 'vitest';
import { ApprovalQueue, DuplicateRequestIdError, TooManyPendingRequestsError, MAX_PENDING_PER_ORIGIN } from '../approval-queue';
import type { NotificationPort } from '../../ports/notification-port';
import type { ApprovalPresenter, ApprovalHandle } from '../../ports/approval-presenter';
import type { PendingRequest } from '../../shared/messages';

class FakePresenter implements ApprovalPresenter {
  opened: string[] = [];
  closed: ApprovalHandle[] = [];
  private dismissers = new Map<string, () => void>();
  private nextHandle = 1;

  async open(requestId: string, onDismiss: () => void): Promise<ApprovalHandle> {
    this.opened.push(requestId);
    this.dismissers.set(requestId, onDismiss);
    return this.nextHandle++;
  }
  close(handle: ApprovalHandle): void {
    this.closed.push(handle);
  }
  /** Simulate the user closing the approval surface without deciding. */
  userDismiss(requestId: string): void {
    this.dismissers.get(requestId)?.();
  }
}

function recordingNotifications(): { port: NotificationPort; counts: number[] } {
  const counts: number[] = [];
  return { port: { async setPendingCount(n) { counts.push(n); } }, counts };
}

const req = (requestId: string, origin = 'https://dapp.example'): PendingRequest => ({
  kind:      'connect',
  requestId,
  origin,
  accountId: 'acct-1',
  createdAt: 0,
});

describe('ApprovalQueue', () => {
  it('presents each enqueued request and resolves with the explicit decision', async () => {
    const presenter = new FakePresenter();
    const { port }  = recordingNotifications();
    const q = new ApprovalQueue(port, presenter);

    const decision = q.enqueue(req('r1'));
    // The entry is registered synchronously, before the presenter is awaited.
    expect(q.get('r1')).toBeDefined();
    expect(presenter.opened).toEqual(['r1']);

    expect(q.resolve('r1', 'approve')).toBe(true);
    expect(await decision).toBe('approve');
    // Resolving dismisses the surface and clears the entry.
    expect(presenter.closed).toHaveLength(1);
    expect(q.get('r1')).toBeUndefined();
  });

  it('treats a user dismiss as a rejection', async () => {
    const presenter = new FakePresenter();
    const { port }  = recordingNotifications();
    const q = new ApprovalQueue(port, presenter);

    const decision = q.enqueue(req('r2'));
    presenter.userDismiss('r2'); // the user closed the popup with no decision

    expect(await decision).toBe('reject');
    expect(q.get('r2')).toBeUndefined();
  });

  it('rejects a duplicate request id', async () => {
    const presenter = new FakePresenter();
    const { port }  = recordingNotifications();
    const q = new ApprovalQueue(port, presenter);

    void q.enqueue(req('dup'));
    // enqueue is async, so the duplicate guard surfaces as a rejected promise —
    // sw-wiring catches it via `await … catch` and maps it to invalid-params.
    await expect(q.enqueue(req('dup'))).rejects.toThrow(DuplicateRequestIdError);
  });

  it('caps in-flight requests per origin and leaves other origins unaffected', async () => {
    const presenter = new FakePresenter();
    const q = new ApprovalQueue(recordingNotifications().port, presenter);

    // Fill the cap for one origin — all left pending (never resolved).
    for (let i = 0; i < MAX_PENDING_PER_ORIGIN; i++) void q.enqueue(req(`a${i}`, 'https://flood.example'));
    expect(presenter.opened).toHaveLength(MAX_PENDING_PER_ORIGIN);

    // The next request from the same origin is rejected without opening a popup.
    await expect(q.enqueue(req('a-over', 'https://flood.example'))).rejects.toThrow(TooManyPendingRequestsError);
    expect(presenter.opened).toHaveLength(MAX_PENDING_PER_ORIGIN);

    // A different origin still gets through.
    void q.enqueue(req('b0', 'https://other.example'));
    expect(presenter.opened).toContain('b0');

    // Resolving one frees a slot for the flooding origin again.
    expect(q.resolve('a0', 'reject')).toBe(true);
    void q.enqueue(req('a-again', 'https://flood.example'));
    expect(presenter.opened).toContain('a-again');
  });

  it('resolve returns false for an unknown request id', () => {
    const q = new ApprovalQueue(recordingNotifications().port, new FakePresenter());
    expect(q.resolve('nope', 'approve')).toBe(false);
  });

  it('rejectAll ABORTS every pending request — it does not impersonate a user rejection', async () => {
    // ⚠️ THIS TEST ASSERTED `'reject'`, WHICH IS THE DEFECT IT NOW GUARDS. The
    // queue resolved the very value the Reject button produces, so every dApp
    // surface answered "User rejected the request" when the WALLET withdrew the
    // prompt — an auto-lock, a reset, a service-worker suspend. During a
    // multi-operation ceremony that is both a false statement about the operator
    // and a false lead for whoever is debugging why the run stopped.
    const presenter = new FakePresenter();
    const { port }  = recordingNotifications();
    const q = new ApprovalQueue(port, presenter);

    const a = q.enqueue(req('a'));
    const b = q.enqueue(req('b'));
    expect(q.list()).toHaveLength(2);

    q.rejectAll('idle:locked');

    // The reason travels WITH the decision: by the time a consumer reads it the
    // queue that knew why has already been flushed.
    expect(await a).toEqual({ aborted: 'idle:locked' });
    expect(await b).toEqual({ aborted: 'idle:locked' });
    expect(await a).not.toBe('reject');
    expect(q.list()).toHaveLength(0);
    expect(presenter.closed).toHaveLength(2);
  });

  it('still resolves a plain string for the operator\'s own two answers', async () => {
    // The union must not leak into the UI path: an approval is `'approve'`, a
    // rejection is `'reject'`, and only the wallet's own withdrawal is an object.
    const q = new ApprovalQueue(recordingNotifications().port, new FakePresenter());
    const approved = q.enqueue(req('ok'));
    q.resolve('ok', 'approve');
    expect(await approved).toBe('approve');

    const declined = q.enqueue(req('no'));
    q.resolve('no', 'reject');
    expect(await declined).toBe('reject');
  });

  it('reflects the pending count on the badge as requests come and go', async () => {
    const presenter = new FakePresenter();
    const { port, counts } = recordingNotifications();
    const q = new ApprovalQueue(port, presenter);

    q.enqueue(req('r1'));
    q.enqueue(req('r2'));
    expect(counts.at(-1)).toBe(2);

    q.resolve('r1', 'approve');
    expect(counts.at(-1)).toBe(1);
    q.resolve('r2', 'reject');
    expect(counts.at(-1)).toBe(0);
  });

  it('rejects the request if the presenter cannot show the UI', async () => {
    const failing: ApprovalPresenter = {
      async open() { throw new Error('no window available'); },
      close() {},
    };
    const q = new ApprovalQueue(recordingNotifications().port, failing);

    expect(await q.enqueue(req('r1'))).toBe('reject');
    expect(q.get('r1')).toBeUndefined();
  });
});
