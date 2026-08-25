/**
 * StoredSession: persisted per-origin dApp session.
 * SessionStore: persistence interface for list/upsert/remove/clear.
 */

export interface StoredSession {
  origin:      string;
  accountId?:  string;
  /**
   * Which dApp surface this session was granted through. Absent means EIP-1193 —
   * every session written before Beacon existed, and every one written by
   * `eth_requestAccounts` since.
   *
   * `eth_accounts` MUST skip `'beacon'` sessions: a Beacon grant discloses a tz1
   * and its public key, and nothing about it is consent to hand the same origin
   * an EVM address it never asked for.
   */
  protocol?:   'beacon';
  tz1Address:  string;
  /** Empty for a Beacon session, which grants no EIP-1193 access. */
  evmAlias:    string;
  /** Empty for a Beacon session. */
  chainId:     string;
  connectedAt: number;
}

/**
 * A session's identity is its ORIGIN PLUS ITS PROTOCOL, not the origin alone.
 *
 * One dApp legitimately connects over both surfaces — the MAPS reference dApp has
 * an EVM path and a native Michelson path — and keying on origin alone made the
 * second connect silently overwrite the first, revoking a grant the user had
 * given without telling either side.
 *
 * The EIP-1193 identity is the bare origin, so every session written before
 * Beacon existed keeps its key and no migration is needed.
 */
export function sessionIdentity(session: Pick<StoredSession, 'origin' | 'protocol'>): string {
  return session.protocol == null ? session.origin : `${session.origin}#${session.protocol}`;
}

export interface SessionStore {
  list():  Promise<StoredSession[]>;
  /** Replaces the session with the same `sessionIdentity`, leaving others alone. */
  upsert(session: StoredSession): Promise<void>;
  /** Removes EVERY protocol's session for this origin — what Disconnect means. */
  remove(origin: string): Promise<void>;
  clear(): Promise<void>;
}
