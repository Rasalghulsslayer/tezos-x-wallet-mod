/**
 * MobileApprovalPresenter: the mobile implementation of the core ApprovalPresenter
 * port. Where the extension opens a chrome.windows popup, mobile shows an in-app
 * modal — driven entirely through the `approvalUi` bridge, which App observes.
 *
 * The ApprovalQueue owns the decision promise and the onDismiss→reject mapping;
 * this presenter owns only the surface. `open` shows the modal for a requestId
 * and remembers the queue's onDismiss so a user-initiated dismiss (hardware
 * back / tapping away) can be routed back as a rejection. `close` hides the
 * surface after an explicit decision and must NOT re-fire onDismiss.
 */

import type { ApprovalPresenter, ApprovalHandle } from '@tezosx/wallet-core/ports/approval-presenter';
import { approvalUi } from '../composition/approval-ui';

export class MobileApprovalPresenter implements ApprovalPresenter {
  private dismissers = new Map<string, () => void>();

  open(requestId: string, onDismiss: () => void): Promise<ApprovalHandle> {
    this.dismissers.set(requestId, onDismiss);
    approvalUi.set(requestId);
    return Promise.resolve(requestId);
  }

  close(handle: ApprovalHandle): void {
    const requestId = handle as string;
    this.dismissers.delete(requestId);
    // Only clear the surface if it's still showing this request (a newer
    // approval may already have replaced it).
    if (approvalUi.get() === requestId) approvalUi.set(null);
  }

  /** Invoked by the UI when the user dismisses the modal without a decision
   *  (hardware back / backdrop) — routes to the queue's reject. */
  dismiss(requestId: string): void {
    const onDismiss = this.dismissers.get(requestId);
    if (onDismiss != null) {
      this.dismissers.delete(requestId);
      onDismiss();
    }
  }
}
