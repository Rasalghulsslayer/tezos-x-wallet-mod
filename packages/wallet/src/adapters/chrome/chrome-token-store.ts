/**
 * ChromeTokenStore: TokenStore backed by chrome.storage.local, keyed by
 * `customTokens:<chainId>:<accountId>`. ChainId is in the key for
 * forward-compat (0.10.0 ships single-network).
 */

import type { TokenStore } from '../../ports/token-store';
import type { AccountId } from '../../domain/account';
import type { RegisteredToken } from '../../domain/token';
import { PREVIEWNET_CHAIN_ID } from '../../shared/constants';

const KEY_PREFIX = 'customTokens';
const KEY_INDEX  = `${KEY_PREFIX}:index`;

function storageKey(accountId: AccountId, chainId = PREVIEWNET_CHAIN_ID): string {
  return `${KEY_PREFIX}:${chainId}:${accountId}`;
}

export class ChromeTokenStore implements TokenStore {
  async list(accountId: AccountId): Promise<RegisteredToken[]> {
    const key = storageKey(accountId);
    const data = await chrome.storage.local.get(key);
    return (data[key] as RegisteredToken[] | undefined) ?? [];
  }

  async upsert(accountId: AccountId, token: RegisteredToken): Promise<void> {
    const key = storageKey(accountId);
    const list = await this.list(accountId);
    const addr = token.address.toLowerCase();
    const idx  = list.findIndex((t) => t.address.toLowerCase() === addr);
    const next = idx === -1
      ? [...list, token]
      : list.map((t, i) => (i === idx ? token : t));
    await chrome.storage.local.set({ [key]: next });
    await this.registerKey(key);
  }

  async remove(accountId: AccountId, address: string): Promise<void> {
    const key = storageKey(accountId);
    const list = await this.list(accountId);
    const addr = address.toLowerCase();
    const next = list.filter((t) => t.address.toLowerCase() !== addr);
    if (next.length === list.length) return;
    await chrome.storage.local.set({ [key]: next });
  }

  async clear(): Promise<void> {
    const idx = await this.loadIndex();
    if (idx.length > 0) await chrome.storage.local.remove(idx);
    await chrome.storage.local.remove(KEY_INDEX);
  }

  // ── internal: keep a tiny index of known keys so clear() can find them all ─
  private async registerKey(key: string): Promise<void> {
    const idx = await this.loadIndex();
    if (!idx.includes(key)) {
      await chrome.storage.local.set({ [KEY_INDEX]: [...idx, key] });
    }
  }

  private async loadIndex(): Promise<string[]> {
    const data = await chrome.storage.local.get(KEY_INDEX);
    return (data[KEY_INDEX] as string[] | undefined) ?? [];
  }
}
