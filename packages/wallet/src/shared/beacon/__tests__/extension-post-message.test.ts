/**
 * The wallet's post_message transport, checked against the SDK's OWN crypto and
 * the dApp's own readers rather than against what this file believes.
 *
 * That distinction is the point of the suite. The shipped
 * `WalletPostMessageTransport` looks correct and is not: it inherits the dApp's
 * `PostMessageClient`, so it sends `target: 'toExtension'` and listens for
 * `'toPage'` — both backwards — and never stamps `sender`. A test that asserted
 * this module's own field names would have passed for that class too. So the
 * sealed pairing response here is opened with `openCryptobox` exactly as
 * `PostMessageClient.listenForChannelOpening` opens it, and the encrypted frames
 * are decrypted by a second `MessageBasedClient` — the same base class the dApp
 * end is built on.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { MessageBasedClient } from '@tezos-x/octez.connect-core';
import {
  ExtensionMessageTarget,
  PostMessagePairingRequest,
  StorageKey,
  TransportType,
  defaultValues,
  type ConnectionContext,
  type PeerInfoType,
  type Storage,
  type StorageKeyReturnType,
} from '@tezos-x/octez.connect-types';
import { getKeypairFromSeed, openCryptobox } from '@tezos-x/octez.connect-utils';
import {
  ExtensionPostMessageTransport,
  type BeaconKeyPair,
  type ToPageFrame,
} from '../extension-post-message';

const WALLET_NAME = 'TezosX Wallet';

/** In-memory `Storage`, mirroring ChromeStorage's default-value behaviour. */
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

/**
 * Stand-in for the dApp end. Subclasses the same `MessageBasedClient` the real
 * `PostMessageClient` does, so `encryptMessage` / `decryptMessage` here are
 * byte-for-byte the calls the dApp makes.
 */
class DappSideClient extends MessageBasedClient {
  protected readonly activeListeners = new Map<string, unknown>();
  async init(): Promise<void> {}
  async sendMessage(): Promise<void> {}
  encryptFor(recipientPublicKey: string, message: string): Promise<string> {
    return this.encryptMessage(recipientPublicKey, message);
  }
  decryptFrom(senderPublicKey: string, payload: string): Promise<string> {
    return this.decryptMessage(senderPublicKey, payload);
  }
  publicKeyHex(): Promise<string> { return this.getPublicKey(); }
}

interface Harness {
  transport: ExtensionPostMessageTransport;
  frames:    ToPageFrame[];
  delivered: { message: unknown; info: ConnectionContext }[];
  storage:   MemoryBeaconStorage;
}

async function keyPairFrom(seed: string): Promise<BeaconKeyPair> {
  return getKeypairFromSeed(seed);
}

async function setup(storage = new MemoryBeaconStorage()): Promise<Harness> {
  const frames: ToPageFrame[] = [];
  const delivered: Harness['delivered'] = [];
  const transport = new ExtensionPostMessageTransport(
    WALLET_NAME,
    await keyPairFrom('wallet-seed-for-tests'),
    storage,
    (frame) => { frames.push(frame); },
  );
  await transport.addListener((message, info) => { delivered.push({ message, info }); });
  return { transport, frames, delivered, storage };
}

async function dappPeer(seed = 'dapp-seed-for-tests', name = 'MAPS') {
  const keyPair = await keyPairFrom(seed);
  const client  = new DappSideClient(name, keyPair);
  const publicKey = await client.publicKeyHex();
  return {
    client,
    keyPair,
    publicKey,
    request: new PostMessagePairingRequest('pair-req-1', name, publicKey, '3'),
  };
}

describe('ExtensionPostMessageTransport', () => {
  let h: Harness;
  beforeEach(async () => { h = await setup(); });

  it('reports post_message, which is how the dApp tells an extension from a relay', () => {
    // The MAPS dApp refuses a ceremony over WalletConnect on exactly this field.
    expect(h.transport.type).toBe(TransportType.POST_MESSAGE);
    expect(String(TransportType.POST_MESSAGE)).toBe('post_message');
  });

  describe('pairing', () => {
    it('seals a pairing response the dApp can OPEN with its own keypair', async () => {
      const peer = await dappPeer();
      await h.transport.addPeer(peer.request);

      expect(h.frames).toHaveLength(1);
      const frame = h.frames[0];
      expect(frame.target).toBe(ExtensionMessageTarget.PAGE);
      if (!('payload' in frame)) throw new Error('expected a channel-open frame');

      // This is `PostMessageClient.listenForChannelOpening`, verbatim.
      const opened = await openCryptobox(
        Buffer.from(frame.payload, 'hex'),
        peer.keyPair.publicKey,
        peer.keyPair.secretKey,
      );
      const response = JSON.parse(opened) as Record<string, string>;

      expect(response.type).toBe('postmessage-pairing-response');
      // The dApp records `name` on the peer, and prints it as `paired wallet:`.
      expect(response.name).toBe(WALLET_NAME);
      // Echoing the request's id is what lets the dApp match its own pairing.
      expect(response.id).toBe('pair-req-1');
      expect(response.version).toBe('3');
      expect(response.publicKey).toMatch(/^[0-9a-f]{64}$/);
    });

    it('does not seal a response when the caller asked not to', async () => {
      const peer = await dappPeer();
      await h.transport.addPeer(peer.request, false);
      expect(h.frames).toHaveLength(0);
      // The peer is still recorded, so messages from it are still accepted.
      expect((await h.transport.getPeers()).map((p) => p.publicKey)).toEqual([peer.publicKey]);
    });

    it('persists the peer under the WALLET storage key, not the dApp one', async () => {
      const peer = await dappPeer();
      await h.transport.addPeer(peer.request);
      expect(await h.storage.get(StorageKey.TRANSPORT_POSTMESSAGE_PEERS_WALLET)).toHaveLength(1);
      expect(await h.storage.get(StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP)).toHaveLength(0);
    });
  });

  describe('wallet → dApp', () => {
    it('encrypts to the peer in a frame the dApp can decrypt', async () => {
      const peer = await dappPeer();
      await h.transport.addPeer(peer.request);
      h.frames.length = 0;

      await h.transport.send('the-serialized-beacon-response', { publicKey: peer.publicKey } as PeerInfoType);

      expect(h.frames).toHaveLength(1);
      const frame = h.frames[0];
      expect(frame.target).toBe(ExtensionMessageTarget.PAGE);
      if (!('encryptedPayload' in frame)) throw new Error('expected an encrypted frame');

      const walletPublicKey = await walletPublicKeyOf(h, peer);
      expect(await peer.client.decryptFrom(walletPublicKey, frame.encryptedPayload))
        .toBe('the-serialized-beacon-response');
    });

    it('posts nothing when there is no peer to encrypt to', async () => {
      // A frame is sealed to one peer's key; a peerless broadcast has no
      // recipient, and posting it in the clear would be worse than dropping it.
      await h.transport.send('orphan');
      expect(h.frames).toHaveLength(0);
    });
  });

  describe('dApp → wallet', () => {
    it('decrypts an inbound frame and reports the PEER PUBLIC KEY as the context id', async () => {
      const peer = await dappPeer();
      await h.transport.addPeer(peer.request);

      const walletPublicKey = await walletPublicKeyOf(h, peer);
      const encrypted = await peer.client.encryptFor(walletPublicKey, 'the-serialized-beacon-request');
      h.transport.acceptEncryptedPayload(encrypted);
      await flush();

      expect(h.delivered).toHaveLength(1);
      expect(h.delivered[0].message).toBe('the-serialized-beacon-request');
      // `WalletClient.respondToMessage` routes the reply with
      // `peers.find(p => p.publicKey === connectionContext.id)`. Anything else
      // degrades to a broadcast — and with two paired dApps, answers the wrong one.
      expect(h.delivered[0].info.id).toBe(peer.publicKey);
      expect(h.delivered[0].info.origin).toBe('extension');
    });

    it('drops a frame it cannot decrypt instead of throwing', async () => {
      const peer = await dappPeer();
      await h.transport.addPeer(peer.request);

      h.transport.acceptEncryptedPayload('deadbeef'.repeat(20));
      await flush();
      expect(h.delivered).toHaveLength(0);
    });

    it('routes two paired dApps to their own context ids and never crosses them', async () => {
      const a = await dappPeer('dapp-a-seed', 'dApp A');
      const b = await dappPeer('dapp-b-seed', 'dApp B');
      await h.transport.addPeer(a.request);
      await h.transport.addPeer(b.request);

      const walletPublicKey = await walletPublicKeyOf(h, a);
      h.transport.acceptEncryptedPayload(await b.client.encryptFor(walletPublicKey, 'from-b'));
      await flush();

      expect(h.delivered).toHaveLength(1);
      expect(h.delivered[0].message).toBe('from-b');
      expect(h.delivered[0].info.id).toBe(b.publicKey);
    });

    it('ignores a frame from a peer that is not paired', async () => {
      const paired   = await dappPeer('dapp-a-seed', 'dApp A');
      const stranger = await dappPeer('stranger-seed', 'Stranger');
      await h.transport.addPeer(paired.request);

      const walletPublicKey = await walletPublicKeyOf(h, paired);
      h.transport.acceptEncryptedPayload(await stranger.client.encryptFor(walletPublicKey, 'unpaired'));
      await flush();
      expect(h.delivered).toHaveLength(0);
    });
  });

  describe('connect', () => {
    it('re-attaches a peer stored by an earlier page load', async () => {
      // Peers live in chrome.storage.local, so a tab reload resumes straight to
      // encrypted frames with no new pairing. Without the re-listen the wallet
      // would go deaf after every reload.
      const peer = await dappPeer();
      await h.transport.addPeer(peer.request);
      const walletPublicKey = await walletPublicKeyOf(h, peer);

      const reloaded = await setup(h.storage);
      expect((await reloaded.transport.getPeers()).map((p) => p.publicKey)).toEqual([peer.publicKey]);

      // Before connect(): stored but not listened on.
      reloaded.transport.acceptEncryptedPayload(await peer.client.encryptFor(walletPublicKey, 'pre-connect'));
      await flush();
      expect(reloaded.delivered).toHaveLength(0);

      await reloaded.transport.connect();
      reloaded.transport.acceptEncryptedPayload(await peer.client.encryptFor(walletPublicKey, 'post-connect'));
      await flush();
      expect(reloaded.delivered.map((d) => d.message)).toEqual(['post-connect']);
    });
  });
});

// ── helpers ───────────────────────────────────────────────────────────────────

/** Let the transport's internal decrypt promises settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Re-pair to read the wallet's own Beacon public key out of a sealed response. */
async function sealedFor(
  h:    Harness,
  peer: Awaited<ReturnType<typeof dappPeer>>,
): Promise<{ payload: string }> {
  const before = h.frames.length;
  await h.transport.addPeer(peer.request);
  const frame = h.frames[h.frames.length - 1];
  h.frames.length = before;
  if (!('payload' in frame)) throw new Error('expected a channel-open frame');
  return { payload: frame.payload };
}

async function walletPublicKeyOf(
  h:    Harness,
  peer: Awaited<ReturnType<typeof dappPeer>>,
): Promise<string> {
  const { payload } = await sealedFor(h, peer);
  const opened = await openCryptobox(
    Buffer.from(payload, 'hex'),
    peer.keyPair.publicKey,
    peer.keyPair.secretKey,
  );
  return (JSON.parse(opened) as { publicKey: string }).publicKey;
}
