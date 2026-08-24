/**
 * The WALLET side of Beacon's `post_message` transport.
 *
 * ── WHY THIS EXISTS: the SDK's own wallet transport cannot carry it ───────────
 *
 * `@airgap/beacon-wallet` ships `WalletPostMessageTransport`, but it is unusable
 * for a browser extension in 4.8.x, for two independent reasons — both read off
 * the installed dist, not inferred:
 *
 *  1. WRONG DIRECTION. It inherits `PostMessageClient`
 *     (`@airgap/beacon-transport-postmessage/dist/esm/PostMessageClient.js`),
 *     which is written for the dApp end: `sendMessage` posts
 *     `{ target: 'toExtension', encryptedPayload }` and `subscribeToMessages`
 *     listens for `data.message.target === 'toPage'`. A wallet needs exactly the
 *     mirror of both. Using it, the wallet would talk to other wallets and
 *     listen for its own replies.
 *  2. NO `sender`. The dApp reads the extension id off `event.data.sender.id`
 *     (`PostMessageClient.listenForChannelOpening`, `.subscribeToMessages`), and
 *     `PostMessageClient` never sets it — only a content script knows
 *     `chrome.runtime.id`.
 *
 * So the wire format below is the dApp's own reader, mirrored. The two frame
 * shapes the dApp accepts, verbatim from its code:
 *
 *   channel open   `{ message: { target: 'toPage', payload: <hex sealed box> }, sender: { id } }`
 *   beacon message `{ message: { target: 'toPage', encryptedPayload: <hex> },   sender: { id } }`
 *
 * Everything cryptographic is the SDK's own: `MessageBasedClient` supplies the
 * shared-secret box (`encryptMessage` / `decryptMessage`) and
 * `CommunicationClient.encryptMessageAsymmetric` supplies the sealed box for the
 * pairing response — the same call `P2PCommunicationClient.sendPairingResponse`
 * makes. None of it is re-implemented here.
 *
 * ── WHY IT LIVES IN THE CONTENT SCRIPT ───────────────────────────────────────
 *
 * `@airgap/beacon-core` resolves its `windowRef` to `window` when one exists and
 * to a loopback mock otherwise (`dist/esm/MockWindow.js:22-30`). An MV3 service
 * worker has no `window`, so any Beacon post_message transport running there
 * would post to itself. The ISOLATED content-script world shares the page's
 * window for `postMessage` — which is what `content/bridge.ts` already relies on
 * — so that is where this runs. No signing happens here: the request is relayed
 * to the service worker, which owns the keys.
 *
 * The window itself is injected (`postToPage`) rather than referenced, so the
 * whole transport is exercisable under Vitest's `node` environment.
 */

import { MessageBasedClient, PeerManager, Transport } from '@airgap/beacon-core';
import {
  Origin,
  StorageKey,
  TransportType,
  type ConnectionContext,
  type PeerInfoType,
  type PostMessagePairingRequest,
  type Storage,
} from '@airgap/beacon-types';
import type { getKeypairFromSeed } from '@airgap/beacon-utils';
// The wire format lives in `page-frames`, which the content script also reaches;
// this module is lazily imported and may hold SDK value imports freely.
import { TO_PAGE, type PostToPage, type ToPageFrame } from './page-frames';

/**
 * The SDK's keypair type without a direct dependency on `@stablelib/ed25519`,
 * which is only ever a transitive one here.
 */
export type BeaconKeyPair = Awaited<ReturnType<typeof getKeypairFromSeed>>;

export type { PostToPage, ToPageFrame };

/**
 * Encryption + framing for the wallet end. Subclasses `MessageBasedClient` so
 * the cryptobox handling is the SDK's, not ours.
 */
export class ExtensionPostMessageClient extends MessageBasedClient {
  protected readonly activeListeners = new Map<string, (encryptedPayload: string) => void>();

  constructor(
    name:                        string,
    keyPair:                     BeaconKeyPair,
    private readonly postToPage: PostToPage,
  ) {
    super(name, keyPair);
  }

  /** Nothing to start: the content script owns the single window listener. */
  async init(): Promise<void> {}

  async listenForEncryptedMessage(
    senderPublicKey: string,
    onMessage:       (message: string) => void,
  ): Promise<void> {
    if (this.activeListeners.has(senderPublicKey)) return;
    this.activeListeners.set(senderPublicKey, (encryptedPayload) => {
      void this.decryptMessage(senderPublicKey, encryptedPayload)
        .then(onMessage)
        // Every paired peer is offered every inbound frame, so a frame meant for
        // another peer simply fails to decrypt. Expected, not an error — the
        // SDK's own PostMessageClient swallows it the same way.
        .catch(() => undefined);
    });
  }

  async sendMessage(message: string, peer?: PeerInfoType): Promise<void> {
    // A broadcast with no peer has nowhere to go on this transport: the frame is
    // encrypted to one peer's key. `Transport.send` already fans out per peer.
    if (peer?.publicKey == null) return;
    this.postToPage({
      target:           TO_PAGE,
      encryptedPayload: await this.encryptMessage(peer.publicKey, message),
    });
  }

  /** Offer one inbound encrypted frame to every paired peer. */
  acceptEncryptedPayload(encryptedPayload: string): void {
    for (const listener of this.activeListeners.values()) listener(encryptedPayload);
  }

  /**
   * The sealed `postmessage-pairing-response` for a pairing request — a
   * cryptobox the requesting dApp opens with its own keypair
   * (`PostMessageClient.listenForChannelOpening` → `openCryptobox`).
   */
  async sealedPairingResponse(request: PostMessagePairingRequest): Promise<string> {
    const response = await this.getPairingResponseInfo(request);
    return this.encryptMessageAsymmetric(request.publicKey, JSON.stringify(response));
  }
}

/**
 * `Transport` over the page's `window.postMessage`, wallet end.
 *
 * Reports `TransportType.POST_MESSAGE` because that is what it is — and because
 * the dApp reads `client.transport.type` to tell an extension handshake apart
 * from a WalletConnect relay, whose requests expire mid-ceremony.
 */
export class ExtensionPostMessageTransport extends Transport<
  PostMessagePairingRequest,
  StorageKey.TRANSPORT_POSTMESSAGE_PEERS_WALLET,
  ExtensionPostMessageClient
> {
  readonly type = TransportType.POST_MESSAGE;

  constructor(
    name:                        string,
    keyPair:                     BeaconKeyPair,
    storage:                     Storage,
    private readonly postToPage: PostToPage,
  ) {
    super(
      name,
      new ExtensionPostMessageClient(name, keyPair, postToPage),
      new PeerManager(storage, StorageKey.TRANSPORT_POSTMESSAGE_PEERS_WALLET),
    );
  }

  /**
   * Re-attach every peer paired in an earlier page load. Peers are persisted in
   * `chrome.storage.local`, so without this a dApp that reloads its tab would
   * hold a pairing the wallet no longer listens on.
   */
  override async connect(): Promise<void> {
    const peers = await this.getPeers();
    await Promise.all(peers.map(async (peer) => this.listen(peer.publicKey)));
    await super.connect();
  }

  async listen(publicKey: string): Promise<void> {
    await this.client.listenForEncryptedMessage(publicKey, (message) => {
      // `id` is the PEER'S PUBLIC KEY, deliberately: `WalletClient.respondToMessage`
      // routes a reply with `peers.find(p => p.publicKey === connectionContext.id)`,
      // so anything else here silently degrades to a broadcast — and with two
      // paired dApps that means answering the wrong one.
      const connectionInfo: ConnectionContext = { origin: Origin.EXTENSION, id: publicKey };
      void this.notifyListeners(message, connectionInfo);
    });
  }

  /**
   * Honour `sendPairingResponse`, which the base `Transport.addPeer` accepts and
   * then drops (`beacon-core/dist/esm/transports/Transport.js:111`). Without it
   * the dApp never learns the wallet's public key and the channel never opens.
   */
  override async addPeer(
    peer:                PostMessagePairingRequest,
    sendPairingResponse = true,
  ): Promise<void> {
    await super.addPeer(peer, sendPairingResponse);
    if (!sendPairingResponse) return;
    this.postToPage({
      target:  TO_PAGE,
      payload: await this.client.sealedPairingResponse(peer),
    });
  }

  /** Feed one inbound `toExtension` encrypted frame in from the page. */
  acceptEncryptedPayload(encryptedPayload: string): void {
    this.client.acceptEncryptedPayload(encryptedPayload);
  }
}
