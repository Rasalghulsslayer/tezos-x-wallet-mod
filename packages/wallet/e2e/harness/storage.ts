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

export interface PreInjectInput {
  vault?:    EncryptedVaultLike;
  sessions?: Record<string, StoredSessionLike>;
}

export async function preInject(sw: Worker, input: PreInjectInput): Promise<void> {
  await sw.evaluate(async ({ vault, sessions }) => {
    const payload: Record<string, unknown> = {};
    if (vault != null)    payload.vault    = vault;
    if (sessions != null) payload.sessions = sessions;
    await chrome.storage.local.set(payload);
  }, { vault: input.vault ?? null, sessions: input.sessions ?? null });
}

export async function clearStorage(sw: Worker): Promise<void> {
  await sw.evaluate(async () => {
    await chrome.storage.local.clear();
  });
}
