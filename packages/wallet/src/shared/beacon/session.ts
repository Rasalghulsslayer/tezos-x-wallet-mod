/**
 * Everything Beacon-SDK-heavy, behind one entry point so the content script can
 * load it lazily.
 *
 * ── WHY THE SPLIT ────────────────────────────────────────────────────────────
 *
 * Importing `WalletClient` costs 147 kB minified (48 kB gzip), measured off the
 * build. Most of it is the Matrix P2P transport and `axios`, reachable only
 * through the inherited `WalletClient.init()` that `ExtensionBeaconWalletClient`
 * overrides and never calls — but Rollup cannot prove a base method is dead, so
 * it all ships. Statically importing this from the content script would put that
 * on EVERY page the wallet runs on, which is `<all_urls>`.
 *
 * Beacon dApps broadcast a discovery ping on load; almost none of them go on to
 * pair. So the content script answers the ping on its own and only reaches in
 * here — at which point a dApp is genuinely trying to talk to the wallet.
 */

// MUST be first, and must be here rather than in the content script.
//
// The Beacon SDK reads a BARE GLOBAL `Buffer` in 36 places on the path this
// module executes — `generateGUID` and `toHex`, both reached from
// `BeaconClient`'s constructor via `initSDK()`, are the first two. A content
// script never gets one: `buffer-shim` is imported by the service worker and the
// two UI entry points, and by nothing in the `content_scripts` graph, while
// `vite.config.ts` aliases the `buffer` MODULE without installing a global.
//
// Without it the failure is silent and permanent, not loud: `initSDK()` swallows
// the rejection with `.catch(console.error)`, so `_keyPair` — an `ExposedPromise`
// with no timeout — never settles, `init()` awaits it forever, and the content
// script's `booting = null` retry reset never runs. One `console.error`, then
// every later frame awaits the same dead promise for the life of the page.
//
// Here and not in `content/beacon-bridge.ts` so the polyfill stays inside the
// lazy chunk: the eager chunk has no `Buffer` reads at all (verified — 0
// occurrences in the built `beacon-bridge.ts-*.js`), so paying for it on every
// page would be pure cost.
import '@tezosx/wallet-core/shared/buffer-shim';

import { Serializer } from '@airgap/beacon-core';
import {
  BeaconErrorType,
  BeaconMessageType,
  PostMessagePairingRequest,
  type BeaconRequestOutputMessage,
  type BeaconResponseInputMessage,
} from '@airgap/beacon-types';
import type { Storage as BeaconStorage } from '@airgap/beacon-types';
import type { BeaconRequest, WalletResponse } from '@tezosx/wallet-core/shared/messages';
import type { BeaconPermissionGrant } from '@tezosx/wallet-core/domain/beacon';
import { ExtensionBeaconWalletClient } from './wallet-client';
import type { PostToPage } from './extension-post-message';
import { readPairingRequest } from './page-frames';
import {
  beaconErrorFor,
  errorResponseFor,
  narrowPermissionRequest,
  permissionResponseFor,
} from './responses';

export interface BeaconSessionOptions {
  name:       string;
  iconUrl?:   string;
  /** Where wallet→page frames go. */
  postToPage: PostToPage;
  /** The page origin, attested again by the host when the SW classifies it. */
  origin:     string;
  /** Relay one narrowed request to the service worker. */
  send:       (envelope: BeaconRequest) => Promise<WalletResponse | undefined>;
  /** Mint the id the approval queue keys on — never the dApp's message id. */
  newRequestId: () => string;
  /**
   * Beacon's own storage. Defaults to `chrome.storage.local`, which is
   * extension-private and shared across tabs; overridden by the wire-level tests
   * so the whole session can run without a `chrome` global.
   */
  storage?: BeaconStorage;
}

/** A booted Beacon session: the two things an inbound page frame can need. */
export interface BeaconSession {
  /** Accept a `postmessage-pairing-request` payload and answer the channel open. */
  pair(serializedPayload: string): Promise<void>;
  /** Accept one inbound encrypted frame. */
  accept(encryptedPayload: string): void;
}

export async function startBeaconSession(options: BeaconSessionOptions): Promise<BeaconSession> {
  const client = new ExtensionBeaconWalletClient({
    name:       options.name,
    iconUrl:    options.iconUrl,
    postToPage: options.postToPage,
    storage:    options.storage,
  });

  await client.init();
  await client.connect((message) => { void handle(message); });

  async function handle(message: BeaconRequestOutputMessage): Promise<void> {
    if (message.type !== BeaconMessageType.PermissionRequest) {
      // Milestone 2 wires `operation_request` through the signer. Until then this
      // ANSWERS rather than hanging: nothing beneath a Beacon request carries a
      // timeout, so an unanswered one leaves the dApp waiting forever.
      // UNKNOWN_ERROR, not ABORTED_ERROR, so it cannot be read as a user reject.
      console.warn(
        `[TezosX Wallet] beacon ${message.type} is not implemented yet; refusing. ` +
        'Only permission_request is served at this milestone.',
      );
      await respond(errorResponseFor(message.id, BeaconErrorType.UNKNOWN_ERROR));
      return;
    }

    const envelope: BeaconRequest = {
      type:      'BEACON_REQUEST',
      origin:    options.origin,
      requestId: options.newRequestId(),
      request:   narrowPermissionRequest(message),
    };

    let result: WalletResponse | undefined;
    try {
      result = await options.send(envelope);
    } catch (err) {
      console.warn('[TezosX Wallet] beacon permission_request could not reach the wallet:', err);
      await respond(errorResponseFor(message.id, BeaconErrorType.ABORTED_ERROR));
      return;
    }

    if (result == null || !result.ok) {
      // The envelope's message carries the real reason — locked vault, wrong
      // network, EVM-source active account. The Beacon wire code is coarser than
      // that, so the reason is logged where an operator will look for it.
      const code = result?.code ?? -32603;
      console.warn(
        `[TezosX Wallet] beacon permission_request refused (${code}):`,
        result?.message ?? 'no response from the wallet',
      );
      await respond(errorResponseFor(message.id, beaconErrorFor(code)));
      return;
    }

    const grant = result.data as BeaconPermissionGrant;
    console.info(
      `[TezosX Wallet] beacon permission granted: ${grant.address} @ ${grant.network.rpcUrl} ` +
      `scopes=[${grant.scopes.join(', ')}]`,
    );
    await respond(permissionResponseFor(message.id, grant));
  }

  /**
   * `WalletClient.respond` throws when the request is no longer pending — a tab
   * that navigated away, or a duplicate answer. Not worth failing the page over.
   */
  async function respond(response: BeaconResponseInputMessage): Promise<void> {
    try {
      await client.respond(response);
    } catch (err) {
      console.warn('[TezosX Wallet] beacon respond failed:', err);
    }
  }

  return {
    async pair(serializedPayload) {
      // The payload is page-supplied: bs58check-wrapped JSON whose shape must
      // still be checked before its `publicKey` reaches a cryptobox.
      const peer = readPairingRequest(await new Serializer().deserialize(serializedPayload));
      if (peer == null) {
        console.warn('[TezosX Wallet] beacon pairing request ignored: malformed payload');
        return;
      }
      await client.addPeer(
        new PostMessagePairingRequest(peer.id, peer.name, peer.publicKey, peer.version),
      );
      console.info(`[TezosX Wallet] beacon paired with "${peer.name}"`);
    },
    accept(encryptedPayload) {
      client.acceptEncryptedPayload(encryptedPayload);
    },
  };
}
