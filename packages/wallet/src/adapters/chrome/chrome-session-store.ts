/**
 * ChromeSessionStore: SessionStore implementation backed by chrome.storage.local,
 * keying sessions by origin.
 */

import type { SessionStore, StoredSession } from '@tezosx/wallet-core/ports/session-store';

export class ChromeSessionStore implements SessionStore {
  async list(): Promise<StoredSession[]> {
    const map = await this.loadMap();
    return Object.values(map);
  }

  async upsert(session: StoredSession): Promise<void> {
    const map = await this.loadMap();
    map[session.origin] = session;
    await chrome.storage.local.set({ sessions: map });
  }

  async remove(origin: string): Promise<void> {
    const map = await this.loadMap();
    delete map[origin];
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
