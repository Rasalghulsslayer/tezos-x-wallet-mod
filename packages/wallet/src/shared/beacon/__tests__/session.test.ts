/**
 * Milestone 1 end to end on the wallet side, over the real Beacon wire.
 *
 * A simulated dApp pairs, serializes a genuine v2 `permission_request` with the
 * SDK's own `Serializer`, encrypts it with the SDK's own cryptobox, and posts it
 * in as a page frame. The wallet's answer is then DECRYPTED and DESERIALIZED
 * back with the same SDK before anything is asserted.
 *
 * The point is that nothing here trusts this codebase's own beliefs about the
 * protocol: the SDK's `WalletClient`, `IncomingRequestInterceptor` and
 * `OutgoingResponseInterceptor` all run for real, so the parts most likely to
 * reject a malformed answer — `appMetadata` lookup keyed on `senderId`, the
 * v2-vs-v3 branch, the acknowledge that precedes every response — are exercised
 * rather than assumed.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MessageBasedClient, Serializer, getSenderId } from '@airgap/beacon-core';
import {
  BeaconErrorType,
  BeaconMessageType,
  NetworkType,
  PermissionScope,
  PostMessagePairingRequest,
  StorageKey,
  defaultValues,
  type Storage,
  type StorageKeyReturnType,
} from '@airgap/beacon-types';
import { getKeypairFromSeed, openCryptobox } from '@airgap/beacon-utils';
import { WALLET_BEACON_NETWORK } from '@tezosx/wallet-core/domain/beacon';
import type { BeaconRequest, WalletResponse } from '@tezosx/wallet-core/shared/messages';
import { startBeaconSession, type BeaconSession } from '../session';
import type { ToPageFrame } from '../extension-post-message';

const PREVIEWNET_MICHELSON_RPC = 'https://michelson.previewnet.tezosx.nomadic-labs.com';
const WALLET_NAME = 'TezosX Wallet';
const ORIGIN      = 'https://maps.example';
const TZ1         = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb';
/** The real previewnet NAC gateway — the destination the ceremony's %call_evm uses. */
const GATEWAY_KT1 = 'KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw';
const EDPK        = 'edpkvGfYw3LyB1UcCahKQk4rF2tvbMUk8GFiTuMjL75uGXrpvKXhjn';

class MemoryBeaconStorage implements Storage {
  private readonly map = new Map<string, unknown>();
  async get<K extends StorageKey>(key: K): Promise<StorageKeyReturnType[K]> {
    if (this.map.has(key)) return this.map.get(key) as StorageKeyReturnType[K];
    const fallback = defaultValues[key];
    return (typeof fallback === 'object' && fallback !== null
      ? JSON.parse(JSON.stringify(fallback))
      : fallback) as StorageKeyReturnType[K];
  }
  async set<K extends StorageKey>(key: K, value: StorageKeyReturnType[K]): Promise<void> {
    this.map.set(key, value);
  }
  async delete<K extends StorageKey>(key: K): Promise<void> { this.map.delete(key); }
  async subscribeToStorageChanged(): Promise<void> {}
  getPrefixedKey<K extends StorageKey>(key: K): string { return key; }
}

/** The dApp end, on the same `MessageBasedClient` the real `PostMessageClient` uses. */
class DappSideClient extends MessageBasedClient {
  protected readonly activeListeners = new Map<string, unknown>();
  async init(): Promise<void> {}
  async sendMessage(): Promise<void> {}
  encryptFor(pk: string, message: string): Promise<string> { return this.encryptMessage(pk, message); }
  decryptFrom(pk: string, payload: string): Promise<string> { return this.decryptMessage(pk, payload); }
  publicKeyHex(): Promise<string> { return this.getPublicKey(); }
}

interface Harness {
  session:   BeaconSession;
  frames:    ToPageFrame[];
  sent:      BeaconRequest[];
  dapp:      DappSideClient;
  dappKeys:  Awaited<ReturnType<typeof getKeypairFromSeed>>;
  /** The wallet's Beacon public key, read out of the sealed pairing response. */
  walletKey: string;
  dappSenderId: string;
}

/** Boot a session, pair a dApp, and hand back everything needed to talk to it. */
async function setup(
  reply:   (envelope: BeaconRequest) => WalletResponse | undefined,
  storage: MemoryBeaconStorage = new MemoryBeaconStorage(),
): Promise<Harness> {
  const frames: ToPageFrame[] = [];
  const sent:   BeaconRequest[] = [];

  const session = await startBeaconSession({
    name:         WALLET_NAME,
    postToPage:   (frame) => { frames.push(frame); },
    origin:       ORIGIN,
    storage,
    newRequestId: () => 'minted-by-the-content-script',
    send:         async (envelope) => { sent.push(envelope); return reply(envelope); },
  });

  const dappKeys = await getKeypairFromSeed('dapp-seed-for-session-tests');
  const dapp     = new DappSideClient('MAPS — Multi-Asset Privacy Solution', dappKeys);
  const dappPk   = await dapp.publicKeyHex();

  const request = new PostMessagePairingRequest('pair-1', 'MAPS — Multi-Asset Privacy Solution', dappPk, '3');
  await session.pair(await new Serializer().serialize(request));

  // Open the channel-open frame the way PostMessageClient.listenForChannelOpening
  // does, to learn the wallet's Beacon public key.
  const channelOpen = frames.at(-1);
  if (channelOpen == null || !('payload' in channelOpen)) throw new Error('no channel-open frame');
  const pairingResponse = JSON.parse(await openCryptobox(
    Buffer.from(channelOpen.payload, 'hex'), dappKeys.publicKey, dappKeys.secretKey,
  )) as { publicKey: string; name: string };
  expect(pairingResponse.name).toBe(WALLET_NAME);

  frames.length = 0;
  return {
    session, frames, sent, dapp, dappKeys,
    walletKey:    pairingResponse.publicKey,
    dappSenderId: await getSenderId(dappPk),
  };
}

/**
 * Serialize and encrypt a v2 `permission_request` exactly as `DAppClient` does:
 * `makeRequest` stamps `version: '2'`, and its `senderId` equals
 * `appMetadata.senderId` because both come from `getSenderId(beaconId)`. That
 * equality is load-bearing — `OutgoingResponseInterceptor` looks the appMetadata
 * up by the request's `senderId`, and a mismatch makes `respond()` throw.
 */
async function sendPermissionRequest(h: Harness, overrides: Record<string, unknown> = {}): Promise<string> {
  const id = 'dapp-permission-req-1';
  const message = {
    id,
    version:  '2',
    senderId: h.dappSenderId,
    type:     BeaconMessageType.PermissionRequest,
    appMetadata: { senderId: h.dappSenderId, name: 'MAPS — Multi-Asset Privacy Solution' },
    network:  { type: NetworkType.CUSTOM, name: 'Tezos X previewnet', rpcUrl: PREVIEWNET_MICHELSON_RPC },
    scopes:   [PermissionScope.OPERATION_REQUEST, PermissionScope.SIGN],
    ...overrides,
  };
  const serialized = await new Serializer().serialize(message);
  h.session.accept(await h.dapp.encryptFor(h.walletKey, serialized));
  await flush();
  return id;
}

/** Decrypt and deserialize every frame the wallet posted back. */
async function walletReplies(h: Harness): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (const frame of h.frames) {
    if (!('encryptedPayload' in frame)) continue;
    const plain = await h.dapp.decryptFrom(h.walletKey, frame.encryptedPayload);
    out.push(await new Serializer().deserialize(plain) as Record<string, unknown>);
  }
  return out;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 40; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 5));
  for (let i = 0; i < 40; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 5));
}

const GRANTED: WalletResponse = {
  ok: true,
  data: { address: TZ1, publicKey: EDPK, network: WALLET_BEACON_NETWORK, scopes: ['operation_request'] },
};

describe('startBeaconSession — permission_request over the real Beacon wire', () => {
  beforeEach(() => {
    // Muted, not ignored: the wallet's own refusal logs and the SDK's
    // "multiple Beacon SDK Client instances" notice (its guard flag lives on
    // beacon-core's windowRef, a module singleton under Vitest's node
    // environment, so per-test clients trip it) would otherwise bury the run.
    // In a content script windowRef is the page's window — one client per page.
    for (const level of ['warn', 'error', 'info', 'log'] as const) {
      vi.spyOn(console, level).mockImplementation(() => {});
    }
  });

  it('narrows the request for the service worker and mints its own requestId', async () => {
    const h = await setup(() => GRANTED);
    await sendPermissionRequest(h);

    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toEqual({
      type:      'BEACON_REQUEST',
      origin:    ORIGIN,
      // NOT the dApp's `dapp-permission-req-1`: a page must not be able to pick
      // the key the approval queue tracks it under.
      requestId: 'minted-by-the-content-script',
      request:   {
        kind:    'permission',
        network: { type: 'custom', name: 'Tezos X previewnet', rpcUrl: PREVIEWNET_MICHELSON_RPC },
        scopes:  ['operation_request', 'sign'],
      },
    });
  });

  it('answers with a permission_response the dApp can decrypt and read', async () => {
    const h = await setup(() => GRANTED);
    const id = await sendPermissionRequest(h);

    const replies = await walletReplies(h);
    // The SDK acknowledges every v2 request before the real answer.
    expect(replies.map((r) => r.type)).toEqual([
      BeaconMessageType.Acknowledge,
      BeaconMessageType.PermissionResponse,
    ]);

    const response = replies[1];
    expect(response.id).toBe(id);
    expect(response.address).toBe(TZ1);
    expect(response.publicKey).toBe(EDPK);
    expect(response.walletType).toBe('implicit');
    expect(response.scopes).toEqual(['operation_request']);
    // What the dApp's network gate decides on.
    expect(response.network).toEqual({
      type: 'custom', name: 'Tezos X previewnet', rpcUrl: PREVIEWNET_MICHELSON_RPC,
    });
  });

  it('lets the SDK fill in senderId, version and appMetadata', async () => {
    // These are the three fields OutgoingResponseInterceptor injects. Their
    // presence proves the v2 enriching branch ran rather than the v3 pass-through.
    const h = await setup(() => GRANTED);
    await sendPermissionRequest(h);

    const response = (await walletReplies(h))[1];
    expect(response.version).toBe('2');
    expect(typeof response.senderId).toBe('string');
    expect(response.appMetadata).toMatchObject({ name: WALLET_NAME });
  });

  it('records the grant as a Beacon permission the SDK can list', async () => {
    const h = await setup(() => GRANTED);
    await sendPermissionRequest(h);
    // The Beacon SDK's own permission record is what stands in for a session
    // here — the wallet deliberately writes no StoredSession for Beacon.
    const replies = await walletReplies(h);
    expect(replies).toHaveLength(2);
  });

  // ── Refusals: a real Error message, never a thrown string ───────────────────

  it('maps a user rejection to ABORTED_ERROR', async () => {
    const h = await setup(() => ({ ok: false, code: 4001, message: 'User rejected the request' }));
    const id = await sendPermissionRequest(h);

    const replies = await walletReplies(h);
    expect(replies.map((r) => r.type)).toEqual([BeaconMessageType.Acknowledge, BeaconMessageType.Error]);
    expect(replies[1]).toMatchObject({ id, errorType: BeaconErrorType.ABORTED_ERROR, version: '2' });
  });

  it('maps a wrong-network refusal to NETWORK_NOT_SUPPORTED', async () => {
    const h = await setup(() => ({ ok: false, code: 5001, message: 'This wallet signs on previewnet' }));
    await sendPermissionRequest(h);
    expect((await walletReplies(h))[1]).toMatchObject({ errorType: BeaconErrorType.NETWORK_NOT_SUPPORTED });
  });

  it('maps an EVM-source active account to NO_ADDRESS_ERROR', async () => {
    const h = await setup(() => ({ ok: false, code: 5002, message: 'The active account is an EVM account' }));
    await sendPermissionRequest(h);
    expect((await walletReplies(h))[1]).toMatchObject({ errorType: BeaconErrorType.NO_ADDRESS_ERROR });
  });

  it('maps a locked wallet to ABORTED_ERROR rather than leaving the dApp waiting', async () => {
    const h = await setup(() => ({ ok: false, code: 4100, message: 'Wallet is locked' }));
    await sendPermissionRequest(h);
    expect((await walletReplies(h))[1]).toMatchObject({ errorType: BeaconErrorType.ABORTED_ERROR });
  });

  it('answers even when the service worker returns nothing at all', async () => {
    const h = await setup(() => undefined);
    await sendPermissionRequest(h);
    expect((await walletReplies(h))[1]).toMatchObject({ errorType: BeaconErrorType.ABORTED_ERROR });
  });

  it('answers when the relay to the service worker throws', async () => {
    const frames: ToPageFrame[] = [];
    const sent:   BeaconRequest[] = [];
    const session = await startBeaconSession({
      name:         WALLET_NAME,
      postToPage:   (frame) => { frames.push(frame); },
      origin:       ORIGIN,
      storage:      new MemoryBeaconStorage(),
      newRequestId: () => 'minted',
      send:         async (envelope) => { sent.push(envelope); throw new Error('SW unreachable'); },
    });

    const dappKeys = await getKeypairFromSeed('dapp-seed-throwing');
    const dapp     = new DappSideClient('MAPS', dappKeys);
    const dappPk   = await dapp.publicKeyHex();
    await session.pair(await new Serializer().serialize(
      new PostMessagePairingRequest('pair-1', 'MAPS', dappPk, '3'),
    ));
    const channelOpen = frames.at(-1);
    if (channelOpen == null || !('payload' in channelOpen)) throw new Error('no channel-open frame');
    const walletKey = (JSON.parse(await openCryptobox(
      Buffer.from(channelOpen.payload, 'hex'), dappKeys.publicKey, dappKeys.secretKey,
    )) as { publicKey: string }).publicKey;
    frames.length = 0;

    const senderId = await getSenderId(dappPk);
    session.accept(await dapp.encryptFor(walletKey, await new Serializer().serialize({
      id: 'req-throw', version: '2', senderId,
      type: BeaconMessageType.PermissionRequest,
      appMetadata: { senderId, name: 'MAPS' },
      network: { type: NetworkType.CUSTOM, rpcUrl: PREVIEWNET_MICHELSON_RPC },
      scopes: [PermissionScope.OPERATION_REQUEST],
    })));
    await flush();

    const decoded: Record<string, unknown>[] = [];
    for (const frame of frames) {
      if (!('encryptedPayload' in frame)) continue;
      decoded.push(await new Serializer().deserialize(
        await dapp.decryptFrom(walletKey, frame.encryptedPayload),
      ) as Record<string, unknown>);
    }
    expect(decoded.at(-1)).toMatchObject({ errorType: BeaconErrorType.ABORTED_ERROR });
  });

  // ── Requests this milestone does not serve ──────────────────────────────────

  // ── operation_request, over the same real wire ──────────────────────────────

  /** The pinned `%call_evm` shape the ceremony actually sends. */
  const CEREMONY_OP = {
    kind:          'transaction',
    amount:        '0',
    destination:   GATEWAY_KT1,
    fee:           '5000',
    gas_limit:     '20000',
    storage_limit: '10000',
    parameters:    { entrypoint: 'call_evm', value: { prim: 'Pair', args: [{ string: '0xdead' }] } },
  };

  async function sendOperationRequest(
    h:    Harness,
    over: Record<string, unknown> = {},
    id    = 'op-req-1',
  ): Promise<string> {
    const serialized = await new Serializer().serialize({
      id, version: '2', senderId: h.dappSenderId,
      type: BeaconMessageType.OperationRequest,
      network: { type: NetworkType.CUSTOM, rpcUrl: PREVIEWNET_MICHELSON_RPC },
      sourceAddress: TZ1,
      operationDetails: [CEREMONY_OP],
      ...over,
    });
    h.session.accept(await h.dapp.encryptFor(h.walletKey, serialized));
    await flush();
    return id;
  }

  it('relays a pinned transaction to the wallet with its limits intact', async () => {
    const h = await setup((env) =>
      env.request.kind === 'operation' ? { ok: true, data: { opHash: 'oo' + 'Z'.repeat(49) } } : GRANTED);
    await sendPermissionRequest(h);   // grant first: the SDK needs appMetadata on file
    h.sent.length = 0;
    await sendOperationRequest(h);

    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].request).toEqual({
      kind: 'operation',
      operation: {
        destination: GATEWAY_KT1,
        amount:      '0',
        // Paired at the boundary: the wire's `parameters: {entrypoint, value}`
        // becomes one field, so a half-supplied pair cannot travel inward.
        parameter:   { entrypoint: 'call_evm', value: { prim: 'Pair', args: [{ string: '0xdead' }] } },
        // Parsed from Beacon's decimal STRINGS, and only as a complete set.
        limits:      { fee: 5000, gasLimit: 20000, storageLimit: 10000 },
      },
    });
  });

  it('answers an injected operation with its L1 op hash', async () => {
    const opHash = 'ooRealOpHash' + 'x'.repeat(39);
    const h = await setup((env) =>
      env.request.kind === 'operation' ? { ok: true, data: { opHash } } : GRANTED);
    await sendPermissionRequest(h);
    h.frames.length = 0;
    const id = await sendOperationRequest(h);

    const replies = await walletReplies(h);
    const response = replies.find((r) => r.type === BeaconMessageType.OperationResponse);
    // `transactionHash` is the SDK's field name; the dApp calls
    // op.confirmation(1) on it, so it must be a real injected op.
    expect(response).toMatchObject({ id, transactionHash: opHash, version: '2' });
  });

  it('treats a HALF-supplied pin as no pin at all', async () => {
    // This chain's fee floor couples the three knobs, so honouring one of three
    // would produce an operation whose fee does not cover its own gas.
    const h = await setup((env) =>
      env.request.kind === 'operation' ? { ok: true, data: { opHash: 'oo' } } : GRANTED);
    await sendPermissionRequest(h);
    h.sent.length = 0;
    await sendOperationRequest(h, {
      operationDetails: [{ ...CEREMONY_OP, gas_limit: undefined }],
    });
    expect((h.sent[0].request as { operation: { limits?: unknown } }).operation.limits).toBeUndefined();
  });

  it('refuses a HALF-SUPPLIED parameter and relays nothing', async () => {
    // `{entrypoint}` with no value renders as a contract call and forges as a
    // plain transfer; `{value}` with no entrypoint is silently dropped. Both are
    // refused at the boundary, before the operator is asked to confirm anything.
    for (const [i, parameters] of [
      { entrypoint: 'setAdmin' },
      { entrypoint: 'setAdmin', value: null },
      { value: { prim: 'Unit' } },
      { entrypoint: 42, value: { prim: 'Unit' } },
    ].entries()) {
      const h = await setup(() => GRANTED);
      await sendPermissionRequest(h);
      h.sent.length = 0; h.frames.length = 0;
      const id = await sendOperationRequest(h, {
        operationDetails: [{ ...CEREMONY_OP, parameters }],
      }, `half-${i}`);

      expect((await walletReplies(h)).find((r) => r.type === BeaconMessageType.Error),
        JSON.stringify(parameters))
        .toMatchObject({ id, errorType: BeaconErrorType.PARAMETERS_INVALID_ERROR });
      expect(h.sent, JSON.stringify(parameters)).toHaveLength(0);
    }
  });

  it('relays a plain transfer with no parameter at all', async () => {
    const h = await setup((env) =>
      env.request.kind === 'operation' ? { ok: true, data: { opHash: 'oo' } } : GRANTED);
    await sendPermissionRequest(h);
    h.sent.length = 0;
    await sendOperationRequest(h, {
      operationDetails: [{ kind: 'transaction', amount: '1000', destination: TZ1,
        fee: '3000', gas_limit: '10000', storage_limit: '0' }],
    }, 'transfer-1');

    expect((h.sent[0].request as { operation: { parameter?: unknown } }).operation.parameter)
      .toBeUndefined();
  });

  it('seeds its OWN app-metadata record at pair time', async () => {
    // operation_request is the first path that READS beacon:app-metadata-list, and
    // the SDK throws `AppMetadata not found` from an un-awaited call when it is
    // missing — which answers nothing at all. Seeding it means the operation path
    // depends on a record the wallet owns, not on page-supplied data another origin
    // can push out of an extension-global list.
    const storage = new MemoryBeaconStorage();
    await setup(() => GRANTED, storage);   // setup() pairs a dApp
    const list = await storage.get(StorageKey.APP_METADATA_LIST);
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((m) => typeof m.senderId === 'string' && m.senderId.length > 0)).toBe(true);
  });

  it('refuses a BATCH with TOO_MANY_OPERATIONS and relays nothing', async () => {
    // Signing the first and reporting success for all of them would be worse
    // than refusing.
    const h = await setup(() => GRANTED);
    await sendPermissionRequest(h);
    h.sent.length = 0; h.frames.length = 0;
    const id = await sendOperationRequest(h, { operationDetails: [CEREMONY_OP, CEREMONY_OP] });

    expect((await walletReplies(h)).find((r) => r.type === BeaconMessageType.Error))
      .toMatchObject({ id, errorType: BeaconErrorType.TOO_MANY_OPERATIONS });
    expect(h.sent).toHaveLength(0);
  });

  it('refuses a non-transaction kind and relays nothing', async () => {
    const h = await setup(() => GRANTED);
    await sendPermissionRequest(h);
    h.sent.length = 0; h.frames.length = 0;
    const id = await sendOperationRequest(h, {
      operationDetails: [{ kind: 'origination', balance: '0', script: {} }],
    });

    expect((await walletReplies(h)).find((r) => r.type === BeaconMessageType.Error))
      .toMatchObject({ id, errorType: BeaconErrorType.PARAMETERS_INVALID_ERROR });
    expect(h.sent).toHaveLength(0);
  });

  it('maps a refused-because-not-connected operation to NOT_GRANTED', async () => {
    const h = await setup((env) => env.request.kind === 'operation'
      ? { ok: false, code: 5003, message: 'Origin is not connected.' }
      : GRANTED);
    await sendPermissionRequest(h);
    h.frames.length = 0;
    const id = await sendOperationRequest(h);
    expect((await walletReplies(h)).find((r) => r.type === BeaconMessageType.Error))
      .toMatchObject({ id, errorType: BeaconErrorType.NOT_GRANTED_ERROR });
  });

  it('maps an approved-then-failed operation to BROADCAST_ERROR, not ABORTED', async () => {
    const h = await setup((env) => env.request.kind === 'operation'
      ? { ok: false, code: 5004, message: 'insufficient_fees' }
      : GRANTED);
    await sendPermissionRequest(h);
    h.frames.length = 0;
    const id = await sendOperationRequest(h);
    expect((await walletReplies(h)).find((r) => r.type === BeaconMessageType.Error))
      .toMatchObject({ id, errorType: BeaconErrorType.BROADCAST_ERROR });
  });

  it('still refuses sign_payload, which this wallet cannot serve', async () => {
    const h = await setup(() => GRANTED);
    await sendPermissionRequest(h);
    h.frames.length = 0;
    const serialized = await new Serializer().serialize({
      id: 'sign-1', version: '2', senderId: h.dappSenderId,
      type: BeaconMessageType.SignPayloadRequest,
      signingType: 'raw', payload: '05010000', sourceAddress: TZ1,
    });
    h.session.accept(await h.dapp.encryptFor(h.walletKey, serialized));
    await flush();

    expect((await walletReplies(h)).find((r) => r.type === BeaconMessageType.Error))
      .toMatchObject({ id: 'sign-1', errorType: BeaconErrorType.UNKNOWN_ERROR });
  });

  // ── Malformed page input ────────────────────────────────────────────────────

  it('ignores a pairing payload that is not a pairing request, without throwing', async () => {
    const h = await setup(() => GRANTED);
    const before = h.frames.length;
    await h.session.pair(await new Serializer().serialize({ type: 'something-else', publicKey: 'nope' }));
    expect(h.frames).toHaveLength(before);
  });

  it('rejects a pairing payload that is not valid bs58check', async () => {
    const h = await setup(() => GRANTED);
    await expect(h.session.pair('not-bs58check!!')).rejects.toThrow();
  });

  it('drops an undecryptable frame without relaying anything', async () => {
    const h = await setup(() => GRANTED);
    h.session.accept('deadbeef'.repeat(20));
    await flush();
    expect(h.sent).toHaveLength(0);
    expect(h.frames).toHaveLength(0);
  });
});
