import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Keyring } from '@tezosx/wallet-core/keyring';
import { WebCryptoPort } from '../../adapters/crypto/web-crypto-port';
import { ApprovalQueue } from '@tezosx/wallet-core/approval-queue';
import { ContainerCache } from '@tezosx/wallet-core/composition/container-cache';
import { dispatch, type SwDeps } from '@tezosx/wallet-core/composition/sw-wiring';
import type { ContentPush } from '@tezosx/wallet-core/shared/messages';
import type { VaultStore, EncryptedVault } from '@tezosx/wallet-core/ports/vault-store';
import type { SessionStore, StoredSession } from '@tezosx/wallet-core/ports/session-store';
import type { TokenStore } from '@tezosx/wallet-core/ports/token-store';
import type { ContactStore } from '@tezosx/wallet-core/ports/contact-store';
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
  async upsert(s: StoredSession) { this.map.set(s.origin, s); }
  async remove(origin: string) { this.map.delete(origin); }
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
    persistentPorts: { vaultStore: new MemoryVault(), sessionStore: new MemorySessions(), tokenStore: new MemoryTokens(), contactStore: new MemoryContacts(), notifications: stubNotifications },
    state:           { container: null, evmAlias: null },
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
});
