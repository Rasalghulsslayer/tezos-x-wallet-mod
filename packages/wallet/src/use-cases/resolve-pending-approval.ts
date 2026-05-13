/**
 * resolvePendingApproval: forwards the user's approve/reject decision from
 * the approve.html UI to the ApprovalQueue, which unblocks the dApp's
 * waiting promise.
 */

import type { ApprovalQueue } from '../background/approval-queue';

export interface ResolvePendingApprovalReq {
  requestId: string;
  decision:  'approve' | 'reject';
}

export interface ResolvePendingApprovalDeps {
  approvalQueue: ApprovalQueue;
}

export function resolvePendingApproval(
  req:  ResolvePendingApprovalReq,
  deps: ResolvePendingApprovalDeps,
): boolean {
  return deps.approvalQueue.resolve(req.requestId, req.decision);
}
