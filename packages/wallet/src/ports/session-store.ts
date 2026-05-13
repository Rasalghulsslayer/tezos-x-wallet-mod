/**
 * StoredSession: persisted per-origin dApp session.
 * SessionStore: persistence interface for list/upsert/remove/clear.
 */

export interface StoredSession {
  origin:      string;
  tz1Address:  string;
  evmAlias:    string;
  chainId:     string;
  connectedAt: number;
}

export interface SessionStore {
  list():  Promise<StoredSession[]>;
  upsert(session: StoredSession): Promise<void>;
  remove(origin: string): Promise<void>;
  clear(): Promise<void>;
}
