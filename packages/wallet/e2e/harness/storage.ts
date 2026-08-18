import type { Worker } from '@playwright/test';

export interface EncryptedVaultLike {
  ciphertext: string;
  iv:         string;
  salt:       string;
  iterations: number;
}

export interface StoredSessionLike {
  origin:      string;
  accountId?:  string;
  tz1Address:  string;
  evmAlias:    string;
  chainId:     string;
  connectedAt: number;
}

/** Mirrors SnapshotEntry<BalancesSnapshotData> from core's snapshot-store port. */
export interface BalancesSnapshotLike {
  data: {
    xtz:   string | null;
    erc20: Record<string, string>;
  };
  fetchedAt: number;
}

export interface PreInjectInput {
  vault?:    EncryptedVaultLike;
  sessions?: Record<string, StoredSessionLike>;
  /** Persisted tz1 → EVM alias map, stored under the 'evmAliases' key the
   *  ChromeAliasStore addresses (see src/adapters/chrome/chrome-alias-store.ts). */
  aliases?:  Record<string, string>;
  /** Balances snapshots keyed by accountId, stored under the
   *  `snapshot:<accountId>:balances` keys the ChromeSnapshotStore addresses
   *  (see src/adapters/chrome/chrome-snapshot-store.ts). */
  balancesSnapshots?: Record<string, BalancesSnapshotLike>;
}

export async function preInject(sw: Worker, input: PreInjectInput): Promise<void> {
  await sw.evaluate(async ({ vault, sessions, aliases, balancesSnapshots }) => {
    const payload: Record<string, unknown> = {};
    if (vault != null)    payload.vault      = vault;
    if (sessions != null) payload.sessions   = sessions;
    if (aliases != null)  payload.evmAliases = aliases;
    if (balancesSnapshots != null) {
      for (const [accountId, entry] of Object.entries(balancesSnapshots)) {
        payload[`snapshot:${accountId}:balances`] = entry;
      }
    }
    await chrome.storage.local.set(payload);
  }, {
    vault:             input.vault ?? null,
    sessions:          input.sessions ?? null,
    aliases:           input.aliases ?? null,
    balancesSnapshots: input.balancesSnapshots ?? null,
  });
}

export async function clearStorage(sw: Worker): Promise<void> {
  await sw.evaluate(async () => {
    await chrome.storage.local.clear();
  });
}
