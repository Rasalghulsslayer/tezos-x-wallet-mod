/**
 * The Beacon `permission_request` handler in `sw-wiring`.
 *
 * Same harness shape as `sw-wiring-approval.test.ts` — a real Keyring over an
 * in-memory vault, a real ApprovalQueue with a no-op presenter, and decisions
 * resolved directly through `approvalQueue.resolve` as the Approve surface
 * would. Nothing here touches chrome, the network, or the Beacon SDK: the
 * service worker's Beacon surface is deliberately SDK-free.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Keyring } from '@tezosx/wallet-core/keyring';
import { WebCryptoPort } from '../../adapters/crypto/web-crypto-port';
import { ApprovalQueue, MAX_PENDING_PER_ORIGIN } from '@tezosx/wallet-core/approval-queue';
import { ContainerCache } from '@tezosx/wallet-core/composition/container-cache';
import { EvmAliasCache } from '@tezosx/wallet-core/shared/evm-alias-cache';

vi.mock('@tezosx/relayer/utils/derive', () => ({
  deriveEvmAlias:      async () => '0x' + 'ab'.repeat(20),
  resolveTezosAddress: async () => 'tz1MockResolvedAddress0000000000000',
}));

/**
 * The post-approval signing path, stubbed at the container seam.
 *
 * A real container builds a real `TezosSigner`, whose `sendOperation` would inject
 * against previewnet. Mocking `ensureContainerFor` — the one place `dispatch`
 * obtains a signer — keeps the whole router under test while making the exact
 * arguments handed to the signer assertable, which is the point: the operation
 * that reaches the signer must be the one the user approved.
 */
const signerCalls: unknown[] = [];
let sendOperationResult: { hash: string } | { throws: Error } = { hash: 'ooTestOpHash' };
let builtForAccountId: string | undefined;

vi.mock('@tezosx/wallet-core/composition/container-builder', () => ({
  ensureContainerFor: async (accountId: string) => {
    builtForAccountId = accountId;
    return {
      signer: {
        kind: 'tezos',
        async sendOperation(op: unknown) {
          signerCalls.push(op);
          if ('throws' in sendOperationResult) throw sendOperationResult.throws;
          return sendOperationResult.hash;
        },
      },
      provider: { request: async () => undefined },
    };
  },
}));

import { dispatch, type SwDeps } from '@tezosx/wallet-core/composition/sw-wiring';
import type { BeaconRequest, PendingRequest } from '@tezosx/wallet-core/shared/messages';
import type { BeaconPermissionGrant } from '@tezosx/wallet-core/domain/beacon';
import type { VaultStore, EncryptedVault } from '@tezosx/wallet-core/ports/vault-store';
import type { SessionStore, StoredSession } from '@tezosx/wallet-core/ports/session-store';
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

const PREVIEWNET_MICHELSON_RPC = 'https://michelson.previewnet.tezosx.nomadic-labs.com';
const ORIGIN   = 'https://maps.example';
const PASSWORD = 'correct-horse-battery';

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
const stubPresenter: ApprovalPresenter = { async open() { return undefined; }, close() {} };

/** The content bridge relaying dApp traffic from a tab. */
const contentSender: ClassifiedSource = { channel: 'dapp', verifiedOrigin: ORIGIN };
/** The wallet's own trusted UI surface. */
const trustedUiSender: ClassifiedSource = { channel: 'trusted-ui' };

async function setupHarness(opts: { unlock?: boolean } = {}) {
  const vault   = new MemoryVault();
  const keyring = new Keyring(vault, new WebCryptoPort());
  await keyring.create(PASSWORD);
  if (opts.unlock === false) keyring.lock();
  const deps: SwDeps = {
    keyring,
    approvalQueue:   new ApprovalQueue(stubNotifications, stubPresenter),
    persistentPorts: {
      vaultStore: vault, sessionStore: new MemorySessions(), tokenStore: new MemoryTokens(),
      contactStore: new MemoryContacts(), aliasStore: new MemoryAliases(),
      snapshotStore: new MemorySnapshots(), notifications: stubNotifications,
    },
    state:            { container: null },
    aliasCache:       new EvmAliasCache(),
    containerCache:   new ContainerCache(),
    rebuildContainer: async () => {},
    broadcastEvent:   async () => {},
  };
  return { keyring, deps };
}

function permissionRequest(overrides: Partial<BeaconRequest> = {}): BeaconRequest {
  return {
    type:      'BEACON_REQUEST',
    origin:    ORIGIN,
    requestId: 'beacon-req-1',
    request:   {
      kind:    'permission',
      network: { type: 'custom', name: 'Tezos X previewnet', rpcUrl: PREVIEWNET_MICHELSON_RPC },
      scopes:  ['operation_request', 'sign'],
    },
    ...overrides,
  };
}

/** Drive a permission request to a user decision and return the envelope. */
async function dispatchAndDecide(
  deps:     SwDeps,
  decision: 'approve' | 'reject',
  msg:      BeaconRequest = permissionRequest(),
) {
  const inflight = dispatch(msg, contentSender, deps);
  await vi.waitFor(() => expect(deps.approvalQueue.get(msg.requestId)).toBeDefined());
  expect(deps.approvalQueue.resolve(msg.requestId, decision)).toBe(true);
  return inflight;
}

/** Drive an operation request to a decision and return the envelope. */
async function dispatchAndDecideOp(
  deps:     SwDeps,
  decision: 'approve' | 'reject',
  requestId = 'beacon-op-1',
) {
  const msg: BeaconRequest = {
    type: 'BEACON_REQUEST', origin: ORIGIN, requestId,
    request: {
      kind: 'operation',
      operation: {
        destination: 'KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw',
        amount: '0', entrypoint: 'call_evm',
        parameters: { prim: 'Pair', args: [{ string: '0xdead' }] },
        limits: { fee: 5000, gasLimit: 20_000, storageLimit: 10_000 },
      },
    },
  };
  const inflight = dispatch(msg, contentSender, deps);
  await vi.waitFor(() => expect(deps.approvalQueue.get(requestId)).toBeDefined());
  expect(deps.approvalQueue.resolve(requestId, decision)).toBe(true);
  return inflight;
}

describe('sw-wiring — Beacon permission_request', () => {
  let h: Awaited<ReturnType<typeof setupHarness>>;

  beforeEach(async () => {
    h = await setupHarness();
    signerCalls.length = 0;
    sendOperationResult = { hash: 'ooTestOpHash' };
    builtForAccountId = undefined;
  });

  // ── The sender guard: the same one the EIP-1193 surface clears ───────────────

  it('rejects a BEACON_REQUEST from an unrecognized sender (4100)', async () => {
    const res = await dispatch(permissionRequest(), null, h.deps);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4100);
    expect(res.message).toMatch(/Forbidden sender/);
  });

  it('rejects a BEACON_REQUEST arriving on the trusted-UI channel', async () => {
    // A trusted-UI sender must not be able to impersonate a dApp and mint itself
    // a permission grant without an approval prompt.
    const res = await dispatch(permissionRequest(), trustedUiSender, h.deps);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4100);
  });

  it('rejects a stamped origin that disagrees with the host-verified one', async () => {
    const res = await dispatch(
      permissionRequest({ origin: 'https://evil.example' }),
      contentSender,   // host attests https://maps.example
      h.deps,
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4100);
  });

  it('enqueues nothing when the sender guard refuses', async () => {
    await dispatch(permissionRequest(), null, h.deps);
    expect(h.deps.approvalQueue.list()).toHaveLength(0);
  });

  // ── Pre-approval refusals ───────────────────────────────────────────────────

  it('refuses while the vault is locked, without prompting', async () => {
    const locked = await setupHarness({ unlock: false });
    const res = await dispatch(permissionRequest(), contentSender, locked.deps);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4100);
    expect(res.message).toMatch(/locked/i);
    expect(locked.deps.approvalQueue.list()).toHaveLength(0);
  });

  it('refuses a network pinned somewhere other than previewnet (5001), before any prompt', async () => {
    const res = await dispatch(
      permissionRequest({
        request: { kind: 'permission', network: { type: 'custom', name: 'shadownet', rpcUrl: 'https://shadownet.example' } },
      }),
      contentSender,
      h.deps,
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(5001);
    // Nothing was shown to the user: a wrong-network request is refused by the
    // wallet, not delegated to the user's judgement.
    expect(h.deps.approvalQueue.list()).toHaveLength(0);
  });

  it('refuses a mainnet request (5001)', async () => {
    const res = await dispatch(
      permissionRequest({ request: { kind: 'permission', network: { type: 'mainnet' } } }),
      contentSender,
      h.deps,
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(5001);
  });

  // ── The user's decision ─────────────────────────────────────────────────────

  it('surfaces 4001 when the user rejects', async () => {
    const res = await dispatchAndDecide(h.deps, 'reject');
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4001);
  });

  it('grants the tz1, its public key, our network and the intersected scopes on approve', async () => {
    const account = h.keyring.getUnlocked()?.account;
    if (account == null || account.kind !== 'tezos') throw new Error('expected a tezos account');

    const res = await dispatchAndDecide(h.deps, 'approve');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');

    const grant = res.data as BeaconPermissionGrant;
    expect(grant.address).toBe(account.tz1);
    expect(grant.address).toMatch(/^tz1/);
    expect(grant.publicKey).toBe(account.publicKey);
    expect(grant.publicKey).toMatch(/^edpk/);
    // The dApp gate decides on this and nothing else.
    expect(grant.network.rpcUrl).toBe(PREVIEWNET_MICHELSON_RPC);
    expect(grant.network.type).toBe('custom');
    // `sign` was asked for and is not granted — the wallet cannot serve it.
    expect(grant.scopes).toEqual(['operation_request']);
  });

  it('marks the pending approval as the Beacon surface, so the prompt can be honest', async () => {
    const msg = permissionRequest();
    const inflight = dispatch(msg, contentSender, h.deps);
    await vi.waitFor(() => expect(h.deps.approvalQueue.get(msg.requestId)).toBeDefined());

    const pending = h.deps.approvalQueue.get(msg.requestId) as Extract<PendingRequest, { kind: 'connect' }>;
    expect(pending.kind).toBe('connect');
    // Without this the Approve screen says "the site will see your 0x address",
    // which is false for a Beacon connection.
    expect(pending.protocol).toBe('beacon');
    expect(pending.origin).toBe(ORIGIN);

    h.deps.approvalQueue.resolve(msg.requestId, 'reject');
    await inflight;
  });

  it('writes a Beacon session, so the connection is revocable and gates operations', async () => {
    const account = h.keyring.getUnlocked()?.account;
    if (account == null || account.kind !== 'tezos') throw new Error('expected a tezos account');

    await dispatchAndDecide(h.deps, 'approve');
    const sessions = await h.deps.persistentPorts.sessionStore.list();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      origin:     ORIGIN,
      protocol:   'beacon',
      accountId:  account.id,
      tz1Address: account.tz1,
      // Empty on purpose: a Beacon session grants no EIP-1193 access, so even a
      // mistake in the eth_accounts filter can disclose nothing.
      evmAlias:   '',
      chainId:    '',
    });
  });

  it('and that session still does NOT satisfy eth_accounts', async () => {
    // The whole point of the protocol discriminator. A Beacon grant discloses a
    // tz1 and its public key; it is not consent to hand over an EVM address.
    await dispatchAndDecide(h.deps, 'approve');
    const accounts = await dispatch(
      { type: 'ETHEREUM_REQUEST', origin: ORIGIN, requestId: 'eth-1', args: { method: 'eth_accounts' } },
      contentSender,
      h.deps,
    );
    expect(accounts.ok).toBe(true);
    if (!accounts.ok) throw new Error('unreachable');
    expect(accounts.data).toEqual([]);
  });

  it('and does NOT satisfy the eth_sendTransaction session gate either', async () => {
    // Without the protocol filter on `requiresSession`, connecting over Beacon
    // would silently authorise EVM signing for the same origin.
    await dispatchAndDecide(h.deps, 'approve');
    const res = await dispatch(
      {
        type: 'ETHEREUM_REQUEST', origin: ORIGIN, requestId: 'eth-2',
        args: { method: 'eth_sendTransaction', params: [{ to: '0x' + '11'.repeat(20), value: '0x0' }] },
      },
      contentSender,
      h.deps,
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4100);
    expect(res.message).toMatch(/not connected/i);
  });

  // ── Structural refusals shared with the EIP-1193 surface ────────────────────

  it('refuses a duplicate request id (-32602)', async () => {
    const msg = permissionRequest();
    const first = dispatch(msg, contentSender, h.deps);
    await vi.waitFor(() => expect(h.deps.approvalQueue.get(msg.requestId)).toBeDefined());

    const second = await dispatch(msg, contentSender, h.deps);
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error('unreachable');
    expect(second.code).toBe(-32602);

    h.deps.approvalQueue.resolve(msg.requestId, 'reject');
    await first;
  });

  it('applies the per-origin flood cap (-32005), so a looping page cannot stack prompts', async () => {
    const inflight = [];
    for (let i = 0; i < MAX_PENDING_PER_ORIGIN; i++) {
      const msg = permissionRequest({ requestId: `beacon-flood-${i}` });
      inflight.push(dispatch(msg, contentSender, h.deps));
      await vi.waitFor(() => expect(h.deps.approvalQueue.get(msg.requestId)).toBeDefined());
    }

    const overflow = await dispatch(permissionRequest({ requestId: 'beacon-flood-x' }), contentSender, h.deps);
    expect(overflow.ok).toBe(false);
    if (overflow.ok) throw new Error('unreachable');
    expect(overflow.code).toBe(-32005);

    for (let i = 0; i < MAX_PENDING_PER_ORIGIN; i++) {
      h.deps.approvalQueue.resolve(`beacon-flood-${i}`, 'reject');
    }
    await Promise.all(inflight);
  });

  it('refuses when the approved account was removed before the grant was built', async () => {
    const msg = permissionRequest();
    const inflight = dispatch(msg, contentSender, h.deps);
    await vi.waitFor(() => expect(h.deps.approvalQueue.get(msg.requestId)).toBeDefined());

    // Approving and then losing the account must not fall back to whichever
    // account happens to be active — it must refuse.
    const accountId = h.keyring.getUnlocked()?.account.id;
    if (accountId == null) throw new Error('expected an unlocked account');
    const listAccounts = vi.spyOn(h.keyring, 'listAccounts').mockReturnValue([]);
    h.deps.approvalQueue.resolve(msg.requestId, 'approve');

    const res = await inflight;
    listAccounts.mockRestore();
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4001);
    expect(res.message).toMatch(/removed before approval/);
  });

  // ── operation_request ───────────────────────────────────────────────────────

  /** The pinned `%call_evm` shape the live ceremony sends. */
  const GATEWAY_KT1 = 'KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw';
  const OP = {
    destination: GATEWAY_KT1,
    amount:      '0',
    entrypoint:  'call_evm',
    parameters:  { prim: 'Pair', args: [{ string: '0xdead' }] },
    limits:      { fee: 5000, gasLimit: 20_000, storageLimit: 10_000 },
  };

  function operationRequest(overrides: Partial<BeaconRequest> = {}): BeaconRequest {
    return {
      type:      'BEACON_REQUEST',
      origin:    ORIGIN,
      requestId: 'beacon-op-1',
      request:   { kind: 'operation', operation: OP },
      ...overrides,
    };
  }

  /** Grant a Beacon permission, so the origin holds a session. */
  async function connect(deps: SwDeps): Promise<void> {
    const res = await dispatchAndDecide(deps, 'approve');
    if (!res.ok) throw new Error('connect failed');
  }

  describe('operation_request', () => {
    it('refuses an origin that never connected (5003), without prompting', async () => {
      const res = await dispatch(operationRequest(), contentSender, h.deps);
      expect(res.ok).toBe(false);
      if (res.ok) throw new Error('unreachable');
      expect(res.code).toBe(5003);
      expect(res.message).toMatch(/not connected/i);
      expect(h.deps.approvalQueue.list()).toHaveLength(0);
    });

    it('refuses an origin whose only session is EIP-1193', async () => {
      // The mirror of "a Beacon grant is not eth_accounts": an EIP-1193 grant is
      // not permission to sign Michelson either.
      await h.deps.persistentPorts.sessionStore.upsert({
        origin: ORIGIN, accountId: h.keyring.getUnlocked()!.account.id,
        tz1Address: '', evmAlias: '0x' + '11'.repeat(20), chainId: '0x1f440',
        connectedAt: Date.now(),
      });
      const res = await dispatch(operationRequest(), contentSender, h.deps);
      expect(res.ok).toBe(false);
      if (res.ok) throw new Error('unreachable');
      expect(res.code).toBe(5003);
    });

    it('refuses a malformed operation BEFORE prompting (-32602)', async () => {
      await connect(h.deps);
      for (const bad of [
        { ...OP, destination: 'not-an-address' },
        { ...OP, amount: '1.5' },
        { ...OP, amount: '-1' },
        { ...OP, entrypoint: 'has spaces' },
        { ...OP, limits: { fee: 5000, gasLimit: 660_001, storageLimit: 10 } },
        { ...OP, limits: { fee: 5000, gasLimit: 10, storageLimit: 60_001 } },
        { ...OP, limits: { fee: -1, gasLimit: 10, storageLimit: 10 } },
      ]) {
        const res = await dispatch(
          operationRequest({ requestId: `bad-${JSON.stringify(bad).length}`, request: { kind: 'operation', operation: bad } }),
          contentSender, h.deps,
        );
        expect(res.ok, JSON.stringify(bad)).toBe(false);
        if (res.ok) throw new Error('unreachable');
        expect(res.code).toBe(-32602);
      }
      // An operator is never asked to confirm something that cannot be submitted.
      expect(h.deps.approvalQueue.list()).toHaveLength(0);
      expect(signerCalls).toHaveLength(0);
    });

    it('surfaces 4001 and signs nothing when the user rejects', async () => {
      await connect(h.deps);
      const msg = operationRequest();
      const inflight = dispatch(msg, contentSender, h.deps);
      await vi.waitFor(() => expect(h.deps.approvalQueue.get(msg.requestId)).toBeDefined());
      h.deps.approvalQueue.resolve(msg.requestId, 'reject');

      const res = await inflight;
      expect(res.ok).toBe(false);
      if (res.ok) throw new Error('unreachable');
      expect(res.code).toBe(4001);
      expect(signerCalls).toHaveLength(0);
    });

    it('shows the operation honestly on the approval screen', async () => {
      await connect(h.deps);
      const msg = operationRequest();
      const inflight = dispatch(msg, contentSender, h.deps);
      await vi.waitFor(() => expect(h.deps.approvalQueue.get(msg.requestId)).toBeDefined());

      const pending = h.deps.approvalQueue.get(msg.requestId) as Extract<PendingRequest, { kind: 'tezos-operation' }>;
      expect(pending.kind).toBe('tezos-operation');
      expect(pending.destination).toBe(GATEWAY_KT1);
      expect(pending.entrypoint).toBe('call_evm');
      expect(pending.amount).toBe('0');
      expect(pending.limits).toEqual(OP.limits);
      // fee charged in full + the whole storage allowance at cost_per_byte = 1.
      expect(pending.maxCostMutez).toBe(String(5000 + 10_000));
      // Raw Micheline, not a decoded claim the wallet cannot stand behind.
      expect(pending.parametersPreview).toContain('0xdead');

      h.deps.approvalQueue.resolve(msg.requestId, 'reject');
      await inflight;
    });

    it('states no cost ceiling for an UNPINNED operation rather than inventing one', async () => {
      await connect(h.deps);
      const msg = operationRequest({
        requestId: 'unpinned-1',
        request: { kind: 'operation', operation: { ...OP, limits: undefined } },
      });
      const inflight = dispatch(msg, contentSender, h.deps);
      await vi.waitFor(() => expect(h.deps.approvalQueue.get(msg.requestId)).toBeDefined());

      const pending = h.deps.approvalQueue.get(msg.requestId) as Extract<PendingRequest, { kind: 'tezos-operation' }>;
      expect(pending.limits).toBeUndefined();
      expect(pending.maxCostMutez).toBeUndefined();

      h.deps.approvalQueue.resolve(msg.requestId, 'reject');
      await inflight;
    });

    it('signs and returns the L1 op hash on approve, with the limits INTACT', async () => {
      await connect(h.deps);
      const res = await dispatchAndDecideOp(h.deps, 'approve');
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error('unreachable');
      expect(res.data).toEqual({ opHash: 'ooTestOpHash' });

      expect(signerCalls).toHaveLength(1);
      // The pin reaches the signer unchanged. Re-estimating one knob of a supplied
      // pin breaks the other two through this chain's fee floor.
      expect(signerCalls[0]).toEqual({
        to:           GATEWAY_KT1,
        mutezAmount:  '0',
        entrypoint:   'call_evm',
        michelineArg: OP.parameters,
        limits:       OP.limits,
      });
    });

    it('signs with the account the SESSION was granted with, not the active one', async () => {
      // A user who switches accounts mid-session must not have a dApp's operation
      // silently re-pointed at the new one.
      await connect(h.deps);
      const granted = h.keyring.getUnlocked()!.account.id;

      const added = await dispatch({ type: 'ADD_ACCOUNT', kind: 'tezos', source: { source: 'fresh' } }, trustedUiSender, h.deps);
      expect(added.ok).toBe(true);
      const other = (added.ok ? added.data as { accountId: string } : null)!.accountId;
      expect(other).not.toBe(granted);
      await dispatch({ type: 'SET_ACTIVE_ACCOUNT', accountId: other }, trustedUiSender, h.deps);
      expect(h.keyring.getUnlocked()!.account.id).toBe(other);

      await dispatchAndDecideOp(h.deps, 'approve');
      expect(builtForAccountId).toBe(granted);
    });

    it('maps an approved-then-failed injection to 5004, not to a user rejection', async () => {
      await connect(h.deps);
      sendOperationResult = { throws: new Error('insufficient_fees: current 638, required 797') };

      const res = await dispatchAndDecideOp(h.deps, 'approve');
      expect(res.ok).toBe(false);
      if (res.ok) throw new Error('unreachable');
      expect(res.code).toBe(5004);
      expect(res.message).toMatch(/insufficient_fees/);
    });

    it('applies the per-origin flood cap to operations too', async () => {
      await connect(h.deps);
      const inflight = [];
      for (let i = 0; i < MAX_PENDING_PER_ORIGIN; i++) {
        const msg = operationRequest({ requestId: `op-flood-${i}` });
        inflight.push(dispatch(msg, contentSender, h.deps));
        await vi.waitFor(() => expect(h.deps.approvalQueue.get(msg.requestId)).toBeDefined());
      }
      const overflow = await dispatch(operationRequest({ requestId: 'op-flood-x' }), contentSender, h.deps);
      expect(overflow.ok).toBe(false);
      if (overflow.ok) throw new Error('unreachable');
      expect(overflow.code).toBe(-32005);

      for (let i = 0; i < MAX_PENDING_PER_ORIGIN; i++) h.deps.approvalQueue.resolve(`op-flood-${i}`, 'reject');
      await Promise.all(inflight);
    });

    it('clears the guard for an unrecognized sender before anything else', async () => {
      await connect(h.deps);
      const res = await dispatch(operationRequest(), null, h.deps);
      expect(res.ok).toBe(false);
      if (res.ok) throw new Error('unreachable');
      expect(res.code).toBe(4100);
      expect(signerCalls).toHaveLength(0);
    });
  });

  it('rejects the pending Beacon approval when the wallet locks mid-prompt', async () => {
    const msg = permissionRequest();
    const inflight = dispatch(msg, contentSender, h.deps);
    await vi.waitFor(() => expect(h.deps.approvalQueue.get(msg.requestId)).toBeDefined());

    // Auto-lock and the LOCK handler both call rejectAll(); a Beacon request in
    // flight must resolve, not hang.
    h.deps.approvalQueue.rejectAll('test lock');

    const res = await inflight;
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4001);
  });
});
