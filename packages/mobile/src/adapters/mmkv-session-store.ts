/**
 * MmkvSessionStore: per-origin dApp sessions (non-secret metadata) in MMKV,
 * one JSON array under a single key. Mirrors the extension's ChromeSessionStore
 * against the SessionStore port.
 */

import type { MMKV } from 'react-native-mmkv';
import type { SessionStore, StoredSession } from '@tezosx/wallet-core/ports/session-store';

const SESSIONS_KEY = 'sessions';

export class MmkvSessionStore implements SessionStore {
  constructor(private readonly mmkv: MMKV) {}

  private read(): StoredSession[] {
    const raw = this.mmkv.getString(SESSIONS_KEY);
    return raw == null ? [] : (JSON.parse(raw) as StoredSession[]);
  }

  private write(sessions: StoredSession[]): void {
    this.mmkv.set(SESSIONS_KEY, JSON.stringify(sessions));
  }

  async list(): Promise<StoredSession[]> {
    return this.read();
  }

  async upsert(session: StoredSession): Promise<void> {
    const next = this.read().filter((s) => s.origin !== session.origin);
    next.push(session);
    this.write(next);
  }

  async remove(origin: string): Promise<void> {
    this.write(this.read().filter((s) => s.origin !== origin));
  }

  async clear(): Promise<void> {
    this.mmkv.remove(SESSIONS_KEY);
  }
}
