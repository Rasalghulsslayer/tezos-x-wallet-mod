/**
 * listPending: returns every dApp approval request currently in the queue.
 */

import type { ApprovalQueue } from '../background/approval-queue';
import type { PendingRequest } from '@tezosx/wallet-core/shared/messages';

export interface ListPendingDeps {
  approvalQueue: ApprovalQueue;
}

export function listPending(deps: ListPendingDeps): PendingRequest[] {
  return deps.approvalQueue.list();
}
