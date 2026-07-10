/**
 * ChromeUnlockGuardStore: persists the unlock throttle state in
 * chrome.storage.local so a lockout survives service-worker restarts (an
 * offline attacker with the stolen vault can restart the process at will).
 */

import type { UnlockGuardStore, UnlockGuardState } from '@tezosx/wallet-core/ports/unlock-guard-store';

const KEY = 'unlockGuard';

export class ChromeUnlockGuardStore implements UnlockGuardStore {
  async load(): Promise<UnlockGuardState | undefined> {
    const data = await chrome.storage.local.get(KEY);
    return data[KEY] as UnlockGuardState | undefined;
  }

  async save(state: UnlockGuardState): Promise<void> {
    await chrome.storage.local.set({ [KEY]: state });
  }

  async clear(): Promise<void> {
    await chrome.storage.local.remove(KEY);
  }
}
