/**
 * disconnectOrigin: removes the stored session for a given dApp origin.
 */

import type { SessionStore } from '../ports/session-store';

export interface DisconnectOriginReq {
  origin: string;
}

export interface DisconnectOriginDeps {
  sessionStore: SessionStore;
}

export function disconnectOrigin(
  req:  DisconnectOriginReq,
  deps: DisconnectOriginDeps,
): Promise<void> {
  return deps.sessionStore.remove(req.origin);
}
