/**
 * listSessions: returns every persisted per-origin dApp session.
 */

import type { SessionStore, StoredSession } from '../ports/session-store';

export interface ListSessionsDeps {
  sessionStore: SessionStore;
}

export function listSessions(deps: ListSessionsDeps): Promise<StoredSession[]> {
  return deps.sessionStore.list();
}
