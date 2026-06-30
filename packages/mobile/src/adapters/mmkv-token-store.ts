/**
 * MmkvTokenStore: per-account custom-token registry (non-secret) in MMKV, one
 * JSON array per account key. Mirrors the extension's ChromeTokenStore against
 * the TokenStore port; upsert dedupes by address so the default-token seeding
 * stays idempotent across unlocks.
 */

import type { MMKV } from 'react-native-mmkv';
import type { TokenStore } from '@tezosx/wallet-core/ports/token-store';
import type { AccountId } from '@tezosx/wallet-core/domain/account';
import type { RegisteredToken } from '@tezosx/wallet-core/domain/token';

const keyFor = (accountId: AccountId): string => `tokens:${accountId}`;

export class MmkvTokenStore implements TokenStore {
  constructor(private readonly mmkv: MMKV) {}

  private read(accountId: AccountId): RegisteredToken[] {
    const raw = this.mmkv.getString(keyFor(accountId));
    return raw == null ? [] : (JSON.parse(raw) as RegisteredToken[]);
  }

  private write(accountId: AccountId, tokens: RegisteredToken[]): void {
    this.mmkv.set(keyFor(accountId), JSON.stringify(tokens));
  }

  async list(accountId: AccountId): Promise<RegisteredToken[]> {
    return this.read(accountId);
  }

  async upsert(accountId: AccountId, token: RegisteredToken): Promise<void> {
    const next = this.read(accountId).filter(
      (t) => t.address.toLowerCase() !== token.address.toLowerCase(),
    );
    next.push(token);
    this.write(accountId, next);
  }

  async remove(accountId: AccountId, address: string): Promise<void> {
    this.write(
      accountId,
      this.read(accountId).filter((t) => t.address.toLowerCase() !== address.toLowerCase()),
    );
  }

  async clear(): Promise<void> {
    for (const key of this.mmkv.getAllKeys()) {
      if (key.startsWith('tokens:')) this.mmkv.remove(key);
    }
  }
}
