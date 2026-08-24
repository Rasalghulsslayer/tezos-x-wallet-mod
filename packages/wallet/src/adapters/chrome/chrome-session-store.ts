/**
 * ChromeSessionStore: SessionStore implementation backed by chrome.storage.local,
 * keying sessions by `sessionIdentity` — origin plus protocol, so one dApp can
 * hold an EIP-1193 and a Beacon grant at once without either overwriting the
 * other. An EIP-1193 identity is the bare origin, so sessions written before
 * Beacon existed keep their key and need no migration.
 */

import { sessionIdentity, type SessionStore, type StoredSession } from '@tezosx/wallet-core/ports/session-store';

export class ChromeSessionStore implements SessionStore {
  async list(): Promise<StoredSession[]> {
    const map = await this.loadMap();
    return Object.values(map);
  }

  async upsert(session: StoredSession): Promise<void> {
    const map = await this.loadMap();
    map[sessionIdentity(session)] = session;
    await chrome.storage.local.set({ sessions: map });
  }

  async remove(origin: string): Promise<void> {
    const map = await this.loadMap();
    // Every protocol's session for this origin: Disconnect revokes the site, not
    // one of the two ways it happened to connect.
    for (const [key, session] of Object.entries(map)) {
      if (session.origin === origin) delete map[key];
    }
    await chrome.storage.local.set({ sessions: map });
  }

  async clear(): Promise<void> {
    await chrome.storage.local.remove('sessions');
  }

  private async loadMap(): Promise<Record<string, StoredSession>> {
    const data = await chrome.storage.local.get('sessions');
    return (data.sessions as Record<string, StoredSession> | undefined) ?? {};
  }
}
