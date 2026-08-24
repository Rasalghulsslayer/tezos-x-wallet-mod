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
import type { ContentPush } from '@tezosx/wallet-core/shared/messages';
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
  async list(id: string) { return this.map.get(id) ?? []; }
  async upsert(id: string, t: RegisteredToken) { this.map.set(id, [...(this.map.get(id) ?? []), t]); }
  async remove(id: string, addr: string) {
    this.map.set(id, (this.map.get(id) ?? []).filter(t => t.address.toLowerCase() !== addr.toLowerCase()));
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

const stubNotifications: NotificationPort = { async setPendingCount() {} };
// dispatch is chrome-free and the queue takes an injected presenter, so this
// suite no longer needs a chrome stub. The presenter is a no-op: tests resolve
// pending requests directly via approvalQueue.resolve.
const stubPresenter: ApprovalPresenter = { async open() { return undefined; }, close() {} };
const PASSWORD    = 'correct-horse-battery';

async function setupHarness() {
  const keyring = new Keyring(new MemoryVault(), new WebCryptoPort());
  await keyring.create(PASSWORD);
  const broadcasts: ContentPush[] = [];
  const deps: SwDeps = {
    keyring,
    approvalQueue:   new ApprovalQueue(stubNotifications, stubPresenter),
    persistentPorts: { vaultStore: new MemoryVault(), sessionStore: new MemorySessions(), tokenStore: new MemoryTokens(), contactStore: new MemoryContacts(), aliasStore: new MemoryAliases(), snapshotStore: new MemorySnapshots(), notifications: stubNotifications },
    state:           { container: null },
    aliasCache:      new EvmAliasCache(),
    containerCache:  new ContainerCache(),
    rebuildContainer: async () => {},
    broadcastEvent:   async (push) => { broadcasts.push(push); },
  };
  return { keyring, deps, broadcasts };
}

// dispatch() takes a transport-neutral ClassifiedSource — the host classifies the
// raw chrome sender first (see adapters/chrome/chrome-message-source). Since #75,
// privileged approve commands are allowed only from the trusted-ui channel; dApp
// traffic from the dapp channel. An unrecognized sender classifies as null.
/** The wallet's own trusted UI surface (the approve page). */
const extensionPageSender: ClassifiedSource = { channel: 'trusted-ui' };
/** The content bridge relaying dApp traffic from a tab. */
const contentSender: ClassifiedSource = { channel: 'dapp', verifiedOrigin: undefined };

describe('sw-wiring — approval gating', () => {
  let h: Awaited<ReturnType<typeof setupHarness>>;

  beforeEach(async () => {
    h = await setupHarness();
  });

  it('rejects RESOLVE_PENDING from a foreign sender (4100 Forbidden sender)', async () => {
    const res = await dispatch(
      { type: 'RESOLVE_PENDING', requestId: 'whatever', decision: 'approve' },
      null, // unrecognized/foreign sender: the classifier attests nothing
      h.deps,
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4100);
    expect(res.message).toMatch(/Forbidden sender/);
  });

  it('rejects GET_PENDING from a foreign sender (4100)', async () => {
    const res = await dispatch(
      { type: 'GET_PENDING', requestId: 'whatever' },
      null, // unrecognized/foreign sender: the classifier attests nothing
      h.deps,
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4100);
  });

  it('lets a same-extension RESOLVE_PENDING past the sender guard (unknown id → invalid params)', async () => {
    const res = await dispatch(
      { type: 'RESOLVE_PENDING', requestId: 'no-such-pending', decision: 'approve' },
      extensionPageSender,
      h.deps,
    );
    // Past the guard: resolvePendingApproval finds no such request → -32602,
    // proving it was NOT short-circuited by the 4100 sender check.
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(-32602);
  });

  it('surfaces 4001 when an eth_requestAccounts approval is rejected by the user', async () => {
    const requestId = 'connect-req-1';
    const pending = dispatch(
      { type: 'ETHEREUM_REQUEST', origin: 'https://dapp.example', requestId, args: { method: 'eth_requestAccounts' } },
      contentSender,
      h.deps,
    );

    // Wait for the request to land in the queue, then reject it as the popup would.
    await vi.waitFor(() => expect(h.deps.approvalQueue.get(requestId)).toBeDefined());
    expect(h.deps.approvalQueue.resolve(requestId, 'reject')).toBe(true);

    const res = await pending;
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4001);
  });

  it('surfaces 4100, NOT 4001, when the wallet auto-locks an eth_requestAccounts prompt', async () => {
    // The EIP-1193 half of the abort/rejection split, and the half a dApp can
    // actually act on: 4001 and 4100 are different codes, where Beacon collapses
    // both to ABORTED_ERROR because its enum has no locked-wallet member.
    //
    // The brief's standing constraint is that this path must not regress, so the
    // rejection above and this abort are asserted as a PAIR — one code moving
    // without the other is the regression to catch.
    const requestId = 'connect-req-locked';
    const pending = dispatch(
      { type: 'ETHEREUM_REQUEST', origin: 'https://dapp.example', requestId, args: { method: 'eth_requestAccounts' } },
      contentSender,
      h.deps,
    );

    await vi.waitFor(() => expect(h.deps.approvalQueue.get(requestId)).toBeDefined());
    h.deps.approvalQueue.rejectAll('idle:idle');

    const res = await pending;
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4100);
    expect(res.message).toContain('idle:idle');
    expect(res.message).not.toMatch(/user rejected/i);
  });
});
