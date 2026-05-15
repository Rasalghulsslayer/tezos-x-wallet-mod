/**
 * getPendingApproval: returns one pending dApp request by id, or null.
 */

import type { ApprovalQueue } from '../background/approval-queue';
import type { PendingRequest } from '../shared/messages';

export interface GetPendingApprovalReq {
  requestId: string;
}

export interface GetPendingApprovalDeps {
  approvalQueue: ApprovalQueue;
}

export function getPendingApproval(
  req:  GetPendingApprovalReq,
  deps: GetPendingApprovalDeps,
): PendingRequest | undefined {
  return deps.approvalQueue.get(req.requestId);
}
