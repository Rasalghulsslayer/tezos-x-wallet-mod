import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Keyring } from '@tezosx/wallet-core/keyring';
import { WebCryptoPort } from '../../adapters/crypto/web-crypto-port';
import { ApprovalQueue } from '@tezosx/wallet-core/approval-queue';
import { ContainerCache } from '@tezosx/wallet-core/composition/container-cache';
import { EvmAliasCache } from '@tezosx/wallet-core/shared/evm-alias-cache';

// dispatch kicks a fire-and-forget alias backfill after state refreshes; stub
// the RPC-backed derivation so the suite never touches the network.
vi.mock('@tezosx/relayer/utils/derive', () => ({
  deriveEvmAlias:      async () => '0x' + 'ab'.repeat(20),
  resolveTezosAddress: async () => 'tz1MockResolvedAddress0000000000000',
}));
import { dispatch, type SwDeps } from '@tezosx/wallet-core/composition/sw-wiring';
import type { ContentPush, PopupRequest, AccountSummary } from '@tezosx/wallet-core/shared/messages';
import type { VaultStore, EncryptedVault } from '@tezosx/wallet-core/ports/vault-store';
import { sessionIdentity, type SessionStore, type StoredSession } from '@tezosx/wallet-core/ports/session-store';
import type { TokenStore } from '@tezosx/wallet-core/ports/token-store';
import type { ContactStore } from '@tezosx/wallet-core/ports/contact-store';
import type { AliasStore } from '@tezosx/wallet-core/ports/alias-store';
import type { BalancesSnapshotData, SnapshotEntry, SnapshotStore } from '@tezosx/wallet-core/ports/snapshot-store';
import type { ActivityItem } from '@tezosx/wallet-core/domain/activity';
import type { NotificationPort } from '@tezosx/wallet-core/ports/notification-port';
import type { ClassifiedSource } from '@tezosx/wallet-core/ports/message-source';
import type { ApprovalPresenter } from '@tezosx/wallet-core/ports/approval-presenter';
import type { RegisteredToken } from '@tezosx/wallet-core/domain/token';
import type { Contact } from '@tezosx/wallet-core/domain/contact';

class MemoryVault implements VaultStore {
  private v: EncryptedVault | undefined;
  async load() { return this.v; }
  async save(v: EncryptedVault) { this.v = v; }
  async clear() { this.v = undefined; }
}

class MemorySessions implements SessionStore {
  private map = new Map<string, StoredSession>();
  async list() { return Array.from(this.map.values()); }
  // Keyed by `sessionIdentity`, matching the real adapters: one origin may hold an
  // EIP-1193 and a Beacon session at once, and a double that keys on origin alone
  // makes the correct coexistence test read RED.
  async upsert(s: StoredSession) { this.map.set(sessionIdentity(s), s); }
  async remove(origin: string) {
    for (const [key, s] of this.map) if (s.origin === origin) this.map.delete(key);
  }
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

class MemoryContacts implements ContactStore {
  private map = new Map<string, Contact>();
  async list() { return Array.from(this.map.values()); }
  async upsert(c: Contact) { this.map.set(c.address, c); }
  async remove(address: string) { this.map.delete(address); }
  async clear() { this.map.clear(); }
}

class MemoryAliases implements AliasStore {
  private map: Record<string, string> = {};
  async load() { return { ...this.map }; }
  async save(entries: Record<string, string>) { this.map = { ...entries }; }
  async clear() { this.map = {}; }
}

class MemorySnapshots implements SnapshotStore {
  private balances = new Map<string, SnapshotEntry<BalancesSnapshotData>>();
  private activity = new Map<string, SnapshotEntry<ActivityItem[]>>();
  async loadBalances(id: string) { return this.balances.get(id) ?? null; }
  async saveBalances(id: string, entry: SnapshotEntry<BalancesSnapshotData>) { this.balances.set(id, entry); }
  async loadActivity(id: string) { return this.activity.get(id) ?? null; }
  async saveActivity(id: string, entry: SnapshotEntry<ActivityItem[]>) { this.activity.set(id, entry); }
  async clearAccount(id: string) { this.balances.delete(id); this.activity.delete(id); }
  async clear() { this.balances.clear(); this.activity.clear(); }
}

const stubNotifications: NotificationPort = {
  async setPendingCount() {},
};

// No test here needs an approval surface (signing requests reject before the
// enqueue path; the RESET_WALLET test enqueues directly and only watches the
// decision promise), so a no-op presenter is enough to satisfy the constructor.
const stubPresenter: ApprovalPresenter = { async open() { return undefined; }, close() {} };

// dispatch() takes a transport-neutral ClassifiedSource — the host classifies
// the raw chrome sender before calling it (see adapters/chrome/chrome-message-source,
// which has its own test). These fixtures stand in for the two channels.
/** The wallet's own trusted UI surface (popup / approve page / side panel). */
const popupSender: ClassifiedSource = { channel: 'trusted-ui' };
/** The content bridge relaying dApp traffic from a tab (no attested origin). */
const contentSender: ClassifiedSource = { channel: 'dapp', verifiedOrigin: undefined };

const PASSWORD = 'correct-horse-battery';

interface Harness {
  keyring:    Keyring;
  deps:       SwDeps;
  broadcasts: ContentPush[];
  rebuilds:   number;
}

async function setupHarness(): Promise<Harness> {
  const keyring        = new Keyring(new MemoryVault(), new WebCryptoPort());
  const sessionStore   = new MemorySessions();
  await keyring.create(PASSWORD);

  const broadcasts: ContentPush[] = [];
  let rebuilds = 0;

  const deps: SwDeps = {
    keyring,
    approvalQueue:  new ApprovalQueue(stubNotifications, stubPresenter),
    persistentPorts: { vaultStore: new MemoryVault(), sessionStore, tokenStore: new MemoryTokens(), contactStore: new MemoryContacts(), aliasStore: new MemoryAliases(), snapshotStore: new MemorySnapshots(), notifications: stubNotifications },
    state:          { container: null },
    aliasCache:     new EvmAliasCache(),
    containerCache: new ContainerCache(),
    rebuildContainer: async () => { rebuilds++; },
    broadcastEvent:   async (push) => { broadcasts.push(push); },
  };

  return { keyring, deps, broadcasts, rebuilds };
}

const send = (deps: SwDeps, msg: PopupRequest) => dispatch(msg, popupSender, deps);

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

  it('SET_ACTIVE_ACCOUNT does NOT broadcast accountsChanged (per-origin scoping — SEC-1)', async () => {
    // Switching the active account for the user's own Send/Receive must not
    // tell any connected dApp: each origin stays bound to the account it
    // connected with. Broadcasting the new active alias to all origins was the
    // SEC-1 leak.
    const firstId = h.keyring.getUnlocked()!.account.id;
    const add     = await send(h.deps, { type: 'ADD_ACCOUNT', kind: 'evm', source: { source: 'fresh' } });
    if (!add.ok) throw new Error('add failed');
    const secondId = (add.data as { accountId: string }).accountId;

    h.broadcasts.length = 0;
    await send(h.deps, { type: 'SET_ACTIVE_ACCOUNT', accountId: secondId });
    expect(h.keyring.getUnlocked()!.account.id).toBe(secondId);
    expect(h.broadcasts.some(b => b.type === 'PROVIDER_EVENT' && b.event === 'accountsChanged')).toBe(false);

    h.broadcasts.length = 0;
    await send(h.deps, { type: 'SET_ACTIVE_ACCOUNT', accountId: firstId });
    expect(h.broadcasts.some(b => b.type === 'PROVIDER_EVENT' && b.event === 'accountsChanged')).toBe(false);
  });

  it('SET_ACTIVE_ACCOUNT to the same id is a no-op (no broadcast)', async () => {
    const firstId = h.keyring.getUnlocked()!.account.id;
    await send(h.deps, { type: 'SET_ACTIVE_ACCOUNT', accountId: firstId });
    expect(h.broadcasts).toHaveLength(0);
  });

  it('REMOVE_ACCOUNT of a non-active account with no bound session does NOT broadcast', async () => {
    const firstId = h.keyring.getUnlocked()!.account.id;
    const add     = await send(h.deps, { type: 'ADD_ACCOUNT', kind: 'evm', source: { source: 'fresh' } });
    if (!add.ok) throw new Error('add failed');
    const secondId = (add.data as { accountId: string }).accountId;

    h.broadcasts.length = 0;
    await send(h.deps, { type: 'REMOVE_ACCOUNT', accountId: secondId, password: PASSWORD });
    expect(h.keyring.listAccounts().map(a => a.id)).toEqual([firstId]);
    expect(h.broadcasts).toHaveLength(0);
  });

  it('REMOVE_ACCOUNT of the active account does NOT broadcast a global alias', async () => {
    const firstId = h.keyring.getUnlocked()!.account.id;
    const add     = await send(h.deps, { type: 'ADD_ACCOUNT', kind: 'evm', source: { source: 'fresh' } });
    if (!add.ok) throw new Error('add failed');
    const secondId = (add.data as { accountId: string }).accountId;

    h.broadcasts.length = 0;
    await send(h.deps, { type: 'REMOVE_ACCOUNT', accountId: firstId, password: PASSWORD });
    expect(h.keyring.getUnlocked()!.account.id).toBe(secondId);
    // No sessions were bound to the removed account, so nothing is announced —
    // and nothing is announced to the (unrelated) surviving account either.
    expect(h.broadcasts.some(b => b.type === 'PROVIDER_EVENT' && b.event === 'accountsChanged')).toBe(false);
  });

  it('REMOVE_ACCOUNT disconnects only the removed account\'s origins (accountsChanged [] per origin)', async () => {
    const firstId = h.keyring.getUnlocked()!.account.id;
    const add     = await send(h.deps, { type: 'ADD_ACCOUNT', kind: 'evm', source: { source: 'fresh' } });
    if (!add.ok) throw new Error('add failed');
    const secondId = (add.data as { accountId: string }).accountId;

    const sessions = h.deps.persistentPorts.sessionStore;
    await sessions.upsert({ origin: 'https://a.example', accountId: firstId,  tz1Address: '', evmAlias: '0xaaa', chainId: '0x1f440', connectedAt: 1 });
    await sessions.upsert({ origin: 'https://b.example', accountId: secondId, tz1Address: '', evmAlias: '0xbbb', chainId: '0x1f440', connectedAt: 2 });

    h.broadcasts.length = 0;
    await send(h.deps, { type: 'REMOVE_ACCOUNT', accountId: firstId, password: PASSWORD });

    // a.example (bound to the removed account) is told []; b.example is untouched.
    const evts = h.broadcasts.filter(b => b.type === 'PROVIDER_EVENT' && b.event === 'accountsChanged');
    expect(evts).toHaveLength(1);
    const [evt] = evts;
    if (evt.type === 'PROVIDER_EVENT' && evt.event === 'accountsChanged') {
      expect(evt.origin).toBe('https://a.example');
      expect(evt.data).toEqual([]);
    }
    const remaining = (await sessions.list()).map(s => s.origin);
    expect(remaining).toEqual(['https://b.example']);
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

    // Default (no accountId) returns the active account's signing material.
    // The onboarding account is derived from the wallet seed, so its
    // per-account reveal is the concrete edsk — the phrase itself has its own
    // export path (EXPORT_WALLET_SEED).
    const def = await send(h.deps, { type: 'EXPORT_SEED', password: PASSWORD });
    if (!def.ok) throw new Error('default export failed');
    expect((def.data as { kind: string }).kind).toBe('edsk');
    // Confirm the active is firstId still.
    expect(h.keyring.getUnlocked()!.account.id).toBe(firstId);
  });

  it('EXPORT_WALLET_SEED returns the onboarding phrase behind the password', async () => {
    const exp = await send(h.deps, { type: 'EXPORT_WALLET_SEED', password: PASSWORD });
    if (!exp.ok) throw new Error('export failed');
    expect(typeof exp.data).toBe('string');
    expect((exp.data as string).trim().split(/\s+/).length).toBeGreaterThanOrEqual(12);

    const bad = await send(h.deps, { type: 'EXPORT_WALLET_SEED', password: 'wrong-password' });
    expect(bad.ok).toBe(false);
  });

  it('ADD_ACCOUNT {source: derived} walks the per-curve HD index — nothing new to back up', async () => {
    const firstId = h.keyring.getUnlocked()!.account.id;

    const addDerived = async (kind: 'tezos' | 'evm') => {
      const res = await send(h.deps, { type: 'ADD_ACCOUNT', kind, source: { source: 'derived' } });
      if (!res.ok) throw new Error(`derived ${kind} add failed: ${res.message}`);
      return res.data as { accountId: string; secret?: string };
    };

    const tzA = await addDerived('tezos');
    const tzB = await addDerived('tezos');
    const evm = await addDerived('evm');

    // No secret comes back — the accounts are covered by the existing phrase,
    // so the UI has nothing to make the user back up.
    expect(tzA.secret).toBeUndefined();
    expect(evm.secret).toBeUndefined();

    const byId = new Map((await h.keyring.listAccountSummaries()).map((s) => [s.id, s]));
    // Onboarding sits at Tezos index 0; consecutive derived adds walk each
    // curve independently (Tezos → 1, 2; the first derived EVM starts at 0).
    expect(byId.get(firstId)?.derivationIndex).toBe(0);
    expect(byId.get(tzA.accountId)?.derivationIndex).toBe(1);
    expect(byId.get(tzB.accountId)?.derivationIndex).toBe(2);
    expect(byId.get(evm.accountId)?.derivationIndex).toBe(0);

    // Distinct indices yield distinct addresses.
    const addrs = [firstId, tzA.accountId, tzB.accountId, evm.accountId]
      .map((id) => byId.get(id)?.primaryAddress);
    expect(new Set(addrs).size).toBe(4);

    // Like every ADD_ACCOUNT, deriving does not flip the active account.
    expect(h.keyring.getUnlocked()!.account.id).toBe(firstId);
  });
});

describe('sw-wiring eth_accounts session gating', () => {
  let h: Harness;
  beforeEach(async () => { h = await setupHarness(); });

  const ethAccounts = (deps: SwDeps, origin: string) =>
    dispatch(
      { type: 'ETHEREUM_REQUEST', origin, requestId: 'req-1', args: { method: 'eth_accounts' } },
      contentSender,
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
      contentSender,
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
      contentSender,
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
      contentSender,
      h.deps,
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(-32601);
  });
});

describe('dispatch sender validation', () => {
  let h: Harness;
  beforeEach(async () => { h = await setupHarness(); });

  it('rejects ETHEREUM_REQUEST from a trusted-ui source (cannot pose as a dApp)', async () => {
    const res = await dispatch(
      { type: 'ETHEREUM_REQUEST', origin: 'https://any.example', requestId: 'req-1', args: { method: 'eth_accounts' } },
      popupSender,
      h.deps,
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4100);
  });

  it('rejects ETHEREUM_REQUEST when the host-verified origin disagrees with the stamped origin', async () => {
    const spoofingSender: ClassifiedSource = { channel: 'dapp', verifiedOrigin: 'https://evil.example' };
    const res = await dispatch(
      { type: 'ETHEREUM_REQUEST', origin: 'https://victim.example', requestId: 'req-2', args: { method: 'eth_accounts' } },
      spoofingSender,
      h.deps,
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4100);
  });

  it('rejects privileged popup commands from a dApp-channel source', async () => {
    const res = await dispatch({ type: 'EXPORT_SEED', password: PASSWORD }, contentSender, h.deps);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4100);
  });

  it('rejects RESOLVE_PENDING from a dApp-channel source', async () => {
    const res = await dispatch(
      { type: 'RESOLVE_PENDING', requestId: 'req-3', decision: 'approve' },
      contentSender,
      h.deps,
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4100);
  });

  it('rejects privileged popup commands from an unrecognized source', async () => {
    // The host could attest no trusted facts (a web page, a foreign extension):
    // the classifier returns null and the privileged guard rejects it.
    const res = await dispatch({ type: 'GET_STATE' }, null, h.deps);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4100);
  });
});

describe('sw-wiring contacts dispatch', () => {
  let h: Harness;
  beforeEach(async () => { h = await setupHarness(); });

  // EIP-55 checksum-valid mixed-case address (spec test vector); the book
  // stores its identity-normalized (lowercase) form.
  const CHECKSUMMED = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
  const NORMALIZED  = CHECKSUMMED.toLowerCase();

  it('ADD_CONTACT stores the contact and returns it with the 0x address lowercased', async () => {
    const res = await send(h.deps, { type: 'ADD_CONTACT', address: CHECKSUMMED, label: 'Alice' });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    const contact = res.data as Contact;
    expect(contact.address).toBe(NORMALIZED);
    expect(contact.label).toBe('Alice');

    const stored = await h.deps.persistentPorts.contactStore.list();
    expect(stored).toHaveLength(1);
    expect(stored[0].address).toBe(NORMALIZED);
  });

  it('ADD_CONTACT rejects an invalid address', async () => {
    const res = await send(h.deps, { type: 'ADD_CONTACT', address: 'not-an-address', label: 'Nobody' });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.message).toMatch(/Invalid address/);
    expect(await h.deps.persistentPorts.contactStore.list()).toHaveLength(0);
  });

  it('LIST_CONTACTS returns the book label-sorted (case-insensitive)', async () => {
    await send(h.deps, { type: 'ADD_CONTACT', address: '0x' + 'a'.repeat(40), label: 'charlie' });
    await send(h.deps, { type: 'ADD_CONTACT', address: '0x' + 'b'.repeat(40), label: 'Alice' });
    await send(h.deps, { type: 'ADD_CONTACT', address: '0x' + 'c'.repeat(40), label: 'Bob' });

    const res = await send(h.deps, { type: 'LIST_CONTACTS' });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect((res.data as Contact[]).map((c) => c.label)).toEqual(['Alice', 'Bob', 'charlie']);
  });

  it('RENAME_CONTACT changes the label but not the address', async () => {
    await send(h.deps, { type: 'ADD_CONTACT', address: CHECKSUMMED, label: 'Alice' });
    const res = await send(h.deps, { type: 'RENAME_CONTACT', address: CHECKSUMMED, label: 'Alice (work)' });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect((res.data as Contact).label).toBe('Alice (work)');

    const stored = await h.deps.persistentPorts.contactStore.list();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ address: NORMALIZED, label: 'Alice (work)' });
  });

  it('REMOVE_CONTACT deletes the entry', async () => {
    await send(h.deps, { type: 'ADD_CONTACT', address: CHECKSUMMED, label: 'Alice' });
    const res = await send(h.deps, { type: 'REMOVE_CONTACT', address: CHECKSUMMED });
    expect(res.ok).toBe(true);
    expect(await h.deps.persistentPorts.contactStore.list()).toHaveLength(0);
  });

  it('returns 4100 for contact commands when the wallet is locked', async () => {
    h.keyring.lock();
    const res = await send(h.deps, { type: 'LIST_CONTACTS' });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4100);
  });
});

describe('sw-wiring password lifecycle dispatch', () => {
  let h: Harness;
  beforeEach(async () => { h = await setupHarness(); });

  const NEW_PASSWORD = 'staple-battery-horse';

  it('CHANGE_PASSWORD re-seals the vault: the old password stops unlocking, the new one works', async () => {
    const accountId = h.keyring.getUnlocked()!.account.id;
    const res = await send(h.deps, { type: 'CHANGE_PASSWORD', currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.ok).toBe(true);

    h.keyring.lock();
    await expect(h.keyring.unlock(PASSWORD)).rejects.toThrow(/Incorrect password/);
    const { accountId: unlockedId } = await h.keyring.unlock(NEW_PASSWORD);
    expect(unlockedId).toBe(accountId);
  });

  it('CHANGE_PASSWORD returns 4100 while locked', async () => {
    h.keyring.lock();
    const res = await send(h.deps, { type: 'CHANGE_PASSWORD', currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4100);
  });

  it('CHANGE_PASSWORD rejects a wrong current password and leaves the vault sealed under the old one', async () => {
    const res = await send(h.deps, { type: 'CHANGE_PASSWORD', currentPassword: 'not-the-password', newPassword: NEW_PASSWORD });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.message).toMatch(/Incorrect password/);

    h.keyring.lock();
    const { accountId } = await h.keyring.unlock(PASSWORD);
    expect(accountId).toBeDefined();
  });

  it('RESET_WALLET while locked wipes the vault, clears sessions and tokens, keeps contacts, rejects pending approvals', async () => {
    const accountId = h.keyring.getUnlocked()!.account.id;
    const { sessionStore, tokenStore, contactStore } = h.deps.persistentPorts;

    await sessionStore.upsert({
      origin: 'https://app.example', accountId,
      tz1Address: '', evmAlias: '0x' + 'a'.repeat(40), chainId: '0x1f4f0', connectedAt: 1,
    });
    await tokenStore.upsert(accountId, {
      address: '0x' + 'b'.repeat(40), symbol: 'TOK', name: 'Token', decimals: 6, addedAt: 1,
    });
    await contactStore.upsert({ address: '0x' + 'c'.repeat(40), label: 'Alice', createdAt: 1 });

    const decision = h.deps.approvalQueue.enqueue({
      kind: 'connect', requestId: 'req-reset-1', origin: 'https://app.example', accountId, createdAt: 1,
    });

    h.keyring.lock();
    const res = await send(h.deps, { type: 'RESET_WALLET' });
    expect(res.ok).toBe(true);

    expect(await h.keyring.hasVault()).toBe(false);
    expect(h.keyring.isUnlocked()).toBe(false);
    expect(await sessionStore.list()).toEqual([]);
    expect(await tokenStore.list(accountId)).toEqual([]);
    // Contacts are wallet-global, non-secret, and still useful after recovery.
    expect((await contactStore.list()).map((c) => c.label)).toEqual(['Alice']);
    // An abort, NOT a 'reject': the operator never answered this prompt, the
    // wallet withdrew it. `'reject'` here would have the dApp told the user
    // declined a reset they triggered themselves.
    await expect(decision).resolves.toEqual({ aborted: 'wallet reset' });
    expect(h.deps.approvalQueue.list()).toEqual([]);
  });
});
