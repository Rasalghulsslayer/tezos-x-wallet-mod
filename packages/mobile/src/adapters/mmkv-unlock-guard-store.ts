/**
 * MmkvUnlockGuardStore: persists the unlock throttle state in MMKV so a lockout
 * survives an app restart. Mirrors the extension's ChromeUnlockGuardStore
 * against the UnlockGuardStore port.
 */

import type { MMKV } from 'react-native-mmkv';
import type { UnlockGuardStore, UnlockGuardState } from '@tezosx/wallet-core/ports/unlock-guard-store';

const KEY = 'unlockGuard';

export class MmkvUnlockGuardStore implements UnlockGuardStore {
  constructor(private readonly mmkv: MMKV) {}

  async load(): Promise<UnlockGuardState | undefined> {
    const raw = this.mmkv.getString(KEY);
    return raw == null ? undefined : (JSON.parse(raw) as UnlockGuardState);
  }

  async save(state: UnlockGuardState): Promise<void> {
    this.mmkv.set(KEY, JSON.stringify(state));
  }

  async clear(): Promise<void> {
    this.mmkv.remove(KEY);
  }
}
