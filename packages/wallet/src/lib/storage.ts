import type { StoredSession } from './messages';

/** Encrypted vault persisted in chrome.storage.local. */
export interface EncryptedVault {
  ciphertext: string;  // base64
  iv:         string;  // base64
  salt:       string;  // base64
  iterations: number;
}

interface StorageSchema {
  vault:    EncryptedVault;
  sessions: Record<string, StoredSession>;
}

type StorageKey = keyof StorageSchema;

async function get<K extends StorageKey>(key: K): Promise<StorageSchema[K] | undefined> {
  const data = await chrome.storage.local.get(key);
  return data[key] as StorageSchema[K] | undefined;
}

async function set<K extends StorageKey>(key: K, value: StorageSchema[K]): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

async function remove<K extends StorageKey>(key: K): Promise<void> {
  await chrome.storage.local.remove(key);
}

// ── Vault ────────────────────────────────────────────────────────────────────

export const vaultStore = {
  load:  () => get('vault'),
  save:  (v: EncryptedVault) => set('vault', v),
  clear: () => remove('vault'),
};

// ── Sessions (connected dApps) ────────────────────────────────────────────────

export const sessionStore = {
  async list(): Promise<StoredSession[]> {
    const map = await get('sessions');
    return Object.values(map ?? {});
  },
  async upsert(session: StoredSession): Promise<void> {
    const map = (await get('sessions')) ?? {};
    map[session.origin] = session;
    await set('sessions', map);
  },
  async remove(origin: string): Promise<void> {
    const map = (await get('sessions')) ?? {};
    delete map[origin];
    await set('sessions', map);
  },
  async clear(): Promise<void> {
    await remove('sessions');
  },
};
