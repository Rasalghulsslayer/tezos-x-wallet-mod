import { describe, expect, it, beforeEach } from 'vitest';
import { Keyring } from '../../background/keyring';
import { ApprovalQueue } from '../../background/approval-queue';
import { ContainerCache } from '../container-cache';
import { dispatch, type SwDeps } from '../sw-wiring';
import type { ContentPush, PopupRequest, AccountSummary } from '../../shared/messages';
import type { VaultStore, EncryptedVault } from '../../ports/vault-store';
import type { SessionStore, StoredSession } from '../../ports/session-store';
import type { TokenStore } from '../../ports/token-store';
import type { NotificationPort } from '../../ports/notification-port';
import type { RegisteredToken } from '../../domain/token';

class MemoryVault implements VaultStore {
  private v: EncryptedVault | undefined;
  async load() { return this.v; }
  async save(v: EncryptedVault) { this.v = v; }
  async clear() { this.v = undefined; }
}

class MemorySessions implements SessionStore {
  private map = new Map<string, StoredSession>();
  async list() { return Array.from(this.map.values()); }
  async upsert(s: StoredSession) { this.map.set(s.origin, s); }
  async remove(origin: string) { this.map.delete(origin); }
  async clear() { this.map.clear(); }
}

class MemoryTokens implements TokenStore {
  private map = new Map<string, RegisteredToken[]>();
  async list(accountId: string) { return this.map.get(accountId) ?? []; }
  async upsert(accountId: string, t: RegisteredToken) {
    const list = this.map.get(accountId) ?? [];
    const idx  = list.findIndex(x => x.address.toLowerCase() === t.address.toLowerCase());
    this.map.set(accountId, idx === -1 ? [...list, t] : list.map((x, i) => i === idx ? t : x));
  }
  async remove(accountId: string, address: string) {
    this.map.set(accountId, (this.map.get(accountId) ?? []).filter(t => t.address.toLowerCase() !== address.toLowerCase()));
  }
  async clear() { this.map.clear(); }
}

const stubNotifications: NotificationPort = {
  async setPendingCount() {},
};

const fakeSender = {} as chrome.runtime.MessageSender;

const PASSWORD = 'correct-horse-battery';

interface Harness {
  keyring:    Keyring;
  deps:       SwDeps;
  broadcasts: ContentPush[];
  rebuilds:   number;
}

async function setupHarness(): Promise<Harness> {
  const keyring        = new Keyring(new MemoryVault());
  const sessionStore   = new MemorySessions();
  await keyring.create(PASSWORD);

  const broadcasts: ContentPush[] = [];
  let rebuilds = 0;

  const deps: SwDeps = {
    keyring,
    approvalQueue:  new ApprovalQueue(stubNotifications),
    persistentPorts: { vaultStore: new MemoryVault(), sessionStore, tokenStore: new MemoryTokens(), notifications: stubNotifications },
    state:          { container: null, evmAlias: null },
    containerCache: new ContainerCache(),
    rebuildContainer: async () => { rebuilds++; },
    broadcastEvent:   async (push) => { broadcasts.push(push); },
  };

  return { keyring, deps, broadcasts, rebuilds };
}

const send = (deps: SwDeps, msg: PopupRequest) => dispatch(msg, fakeSender, deps);

describe('sw-wiring multi-account dispatch', () => {
  let h: Harness;
  beforeEach(async () => { h = await setupHarness(); });

  it('ADD_ACCOUNT returns accountId + secret and grows the vault without flipping active', async () => {
    const firstId = h.keyring.getUnlocked()!.account.id;
    const res = await send(h.deps, { type: 'ADD_ACCOUNT', kind: 'evm', source: { source: 'fresh' } });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    const data = res.data as { accountId: string; secret?: string };
    expect(data.accountId).toMatch(/^[a-f0-9-]{36}$/);
    expect(data.secret).toMatch(/^0x[0-9a-f]{64}$/);
    expect(h.keyring.getUnlocked()!.account.id).toBe(firstId);
    expect(h.broadcasts).toHaveLength(0);
  });

  it('SET_ACTIVE_ACCOUNT broadcasts accountsChanged with the new alias', async () => {
    const firstId = h.keyring.getUnlocked()!.account.id;
    const add     = await send(h.deps, { type: 'ADD_ACCOUNT', kind: 'evm', source: { source: 'fresh' } });
    if (!add.ok) throw new Error('add failed');
    const secondId = (add.data as { accountId: string }).accountId;

    await send(h.deps, { type: 'SET_ACTIVE_ACCOUNT', accountId: secondId });

    expect(h.keyring.getUnlocked()!.account.id).toBe(secondId);
    const broadcast = h.broadcasts.find(b => b.type === 'PROVIDER_EVENT' && b.event === 'accountsChanged');
    expect(broadcast).toBeDefined();
    if (broadcast?.type === 'PROVIDER_EVENT' && broadcast.event === 'accountsChanged') {
      expect(broadcast.data).toEqual([(h.keyring.getUnlocked()!.account as { address: string }).address]);
    }
    // Switching back also broadcasts.
    h.broadcasts.length = 0;
    await send(h.deps, { type: 'SET_ACTIVE_ACCOUNT', accountId: firstId });
    expect(h.broadcasts.some(b => b.type === 'PROVIDER_EVENT' && b.event === 'accountsChanged')).toBe(true);
  });

  it('SET_ACTIVE_ACCOUNT to the same id is a no-op (no broadcast)', async () => {
    const firstId = h.keyring.getUnlocked()!.account.id;
    await send(h.deps, { type: 'SET_ACTIVE_ACCOUNT', accountId: firstId });
    expect(h.broadcasts).toHaveLength(0);
  });

  it('REMOVE_ACCOUNT of a non-active account does NOT broadcast', async () => {
    const firstId = h.keyring.getUnlocked()!.account.id;
    const add     = await send(h.deps, { type: 'ADD_ACCOUNT', kind: 'evm', source: { source: 'fresh' } });
    if (!add.ok) throw new Error('add failed');
    const secondId = (add.data as { accountId: string }).accountId;

    h.broadcasts.length = 0;
    await send(h.deps, { type: 'REMOVE_ACCOUNT', accountId: secondId, password: PASSWORD });
    expect(h.keyring.listAccounts().map(a => a.id)).toEqual([firstId]);
    expect(h.broadcasts).toHaveLength(0);
  });

  it('REMOVE_ACCOUNT of the active account broadcasts the auto-switched alias', async () => {
    const firstId = h.keyring.getUnlocked()!.account.id;
    const add     = await send(h.deps, { type: 'ADD_ACCOUNT', kind: 'evm', source: { source: 'fresh' } });
    if (!add.ok) throw new Error('add failed');
    const secondId = (add.data as { accountId: string }).accountId;

    h.broadcasts.length = 0;
    await send(h.deps, { type: 'REMOVE_ACCOUNT', accountId: firstId, password: PASSWORD });
    expect(h.keyring.getUnlocked()!.account.id).toBe(secondId);
    const broadcast = h.broadcasts.find(b => b.type === 'PROVIDER_EVENT' && b.event === 'accountsChanged');
    expect(broadcast).toBeDefined();
  });

  it('LIST_ACCOUNTS returns the same summary list as GET_STATE', async () => {
    await send(h.deps, { type: 'ADD_ACCOUNT', kind: 'evm', source: { source: 'fresh' } });
    await send(h.deps, { type: 'ADD_ACCOUNT', kind: 'tezos', source: { source: 'fresh' } });

    const list = await send(h.deps, { type: 'LIST_ACCOUNTS' });
    const get  = await send(h.deps, { type: 'GET_STATE' });
    if (!list.ok || !get.ok) throw new Error('unreachable');

    const summaries = list.data as AccountSummary[];
    const stateAccounts = (get.data as { accounts: AccountSummary[] }).accounts;
    expect(summaries.map(s => s.id)).toEqual(stateAccounts.map(s => s.id));
    expect(summaries).toHaveLength(3);
  });

  it('RENAME_ACCOUNT updates the label', async () => {
    const firstId = h.keyring.getUnlocked()!.account.id;
    await send(h.deps, { type: 'RENAME_ACCOUNT', accountId: firstId, label: 'Trading' });
    expect(h.keyring.listAccounts()[0].label).toBe('Trading');
  });

  it('EXPORT_SEED with an accountId returns that account\'s secret (not the active one)', async () => {
    const firstId = h.keyring.getUnlocked()!.account.id;
    const add = await send(h.deps, { type: 'ADD_ACCOUNT', kind: 'evm', source: { source: 'fresh' } });
    if (!add.ok) throw new Error('add failed');
    const { accountId: secondId, secret: addedPriv } = add.data as { accountId: string; secret: string };

    const exp = await send(h.deps, { type: 'EXPORT_SEED', password: PASSWORD, accountId: secondId });
    if (!exp.ok) throw new Error('export failed');
    const exported = exp.data as { kind: 'evm-pk'; value: string };
    expect(exported.kind).toBe('evm-pk');
    expect(`0x${exported.value}`.toLowerCase()).toBe(addedPriv.toLowerCase());

    // Default (no accountId) returns the active one (a Tezos mnemonic from create()).
    const def = await send(h.deps, { type: 'EXPORT_SEED', password: PASSWORD });
    if (!def.ok) throw new Error('default export failed');
    expect((def.data as { kind: string }).kind).toBe('mnemonic');
    // Confirm the active is firstId still.
    expect(h.keyring.getUnlocked()!.account.id).toBe(firstId);
  });
});

describe('sw-wiring eth_accounts session gating', () => {
  let h: Harness;
  beforeEach(async () => { h = await setupHarness(); });

  const ethAccounts = (deps: SwDeps, origin: string) =>
    dispatch(
      { type: 'ETHEREUM_REQUEST', origin, requestId: 'req-1', args: { method: 'eth_accounts' } },
      fakeSender,
      deps,
    );

  it('returns [] for an origin with no session', async () => {
    const res = await ethAccounts(h.deps, 'https://attacker.example');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.data).toEqual([]);
  });

  it("returns the session's evmAlias when the origin is connected", async () => {
    const sessionStore = h.deps.persistentPorts.sessionStore;
    await sessionStore.upsert({
      origin:      'https://connected.example',
      accountId:   h.keyring.getUnlocked()!.account.id,
      tz1Address:  'tz1Sample00000000000000000000000000',
      evmAlias:    '0xabcdef0123456789abcdef0123456789abcdef01',
      chainId:     '0x1f4f0',
      connectedAt: Date.now(),
    });

    const res = await ethAccounts(h.deps, 'https://connected.example');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.data).toEqual(['0xabcdef0123456789abcdef0123456789abcdef01']);
  });

  it('returns [] for a different origin even when another origin has a session', async () => {
    const sessionStore = h.deps.persistentPorts.sessionStore;
    await sessionStore.upsert({
      origin:      'https://app-a.example',
      accountId:   h.keyring.getUnlocked()!.account.id,
      tz1Address:  '',
      evmAlias:    '0xa000000000000000000000000000000000000000',
      chainId:     '0x1f4f0',
      connectedAt: Date.now(),
    });

    const res = await ethAccounts(h.deps, 'https://app-b.example');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.data).toEqual([]);
  });

  it('returns 4100 (unauthorised) when the wallet is locked', async () => {
    h.keyring.lock();
    const res = await ethAccounts(h.deps, 'https://any.example');
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4100);
  });
});

describe('sw-wiring signature-method session gating', () => {
  let h: Harness;
  beforeEach(async () => { h = await setupHarness(); });

  const personalSign = (deps: SwDeps, origin: string) =>
    dispatch(
      {
        type: 'ETHEREUM_REQUEST', origin, requestId: 'req-sig-1',
        args: { method: 'personal_sign', params: ['0xdeadbeef', '0x' + '0'.repeat(40)] },
      },
      fakeSender,
      deps,
    );

  it('rejects personal_sign with 4100 when origin has no session', async () => {
    const res = await personalSign(h.deps, 'https://attacker.example');
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4100);
  });

  it('rejects eth_sendTransaction with 4100 when origin has no session', async () => {
    const res = await dispatch(
      {
        type: 'ETHEREUM_REQUEST', origin: 'https://attacker.example', requestId: 'req-tx-1',
        args: { method: 'eth_sendTransaction', params: [{ to: '0x' + '1'.repeat(40), value: '0x0', data: '0x' }] },
      },
      fakeSender,
      h.deps,
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4100);
  });

  it('rejects eth_signTypedData_v4 with -32601 (unimplemented, never prompted)', async () => {
    const res = await dispatch(
      {
        type: 'ETHEREUM_REQUEST', origin: 'https://attacker.example', requestId: 'req-std-1',
        args: { method: 'eth_signTypedData_v4', params: ['0x' + '0'.repeat(40), '{}'] },
      },
      fakeSender,
      h.deps,
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(-32601);
  });
});
