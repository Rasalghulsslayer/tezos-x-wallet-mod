/**
 * listPending: returns every dApp approval request currently in the queue.
 */

import type { ApprovalQueue } from '../background/approval-queue';
import type { PendingRequest } from '../lib/messages';

export interface ListPendingDeps {
  approvalQueue: ApprovalQueue;
}

export function listPending(deps: ListPendingDeps): PendingRequest[] {
  return deps.approvalQueue.list();
}
