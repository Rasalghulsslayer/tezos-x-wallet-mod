/**
 * The wire format between a Beacon dApp's page context and this wallet, as pure
 * functions over plain data.
 *
 * Every shape here is the mirror of a reader in the dApp's own SDK. The two the
 * frames must satisfy, cited so a future change can be checked rather than
 * guessed at (paths relative to `@airgap/beacon-transport-postmessage/dist/esm`,
 * and byte-identical in the `@ecadlabs/beacon-*` fork the MAPS dApp ships):
 *
 * ⚠️ THESE CITATIONS DESCRIBE THE DAPP'S READER AND ARE DELIBERATELY NOT
 * MIGRATED. This wallet now builds against `@tezos-x/octez.connect-*` 5.0.3, but
 * the MAPS dApp still ships the 4.8 `@ecadlabs` fork, and it is the dApp's
 * reader these frames must satisfy. Repointing them at a 5.x path would cite
 * code that is not what parses these frames.
 *
 *   `PostMessageTransport.listenForExtensions`  reads `event.data.payload === 'pong'`
 *                                              and `event.data.sender` — FLAT.
 *   `PostMessageClient.listenForChannelOpening` reads `event.data.message.target === 'toPage'`,
 *                                              `event.data.message.payload`, `event.data.sender.id`.
 *   `PostMessageClient.subscribeToMessages`     reads `event.data.message.target === 'toPage'`,
 *                                              `event.data.message.encryptedPayload`, `event.data.sender.id`.
 *
 * Note the asymmetry: the discovery pong is flat, everything else is nested
 * under `message`. Getting that wrong makes the wallet invisible in the dApp's
 * pairing modal with no error anywhere — which is why it is spelled out.
 *
 * No `window`, no `chrome`, no SDK state: this module is fully unit-testable.
 */

// TYPE-ONLY, deliberately: this module is reached from the content script, and a
// single VALUE import of the SDK there makes @crxjs/vite-plugin emit the content
// script behind an async loader instead of a synchronous IIFE — which decides
// whether the window listener exists before page script runs. See the note on
// the discovery race in `content/beacon-bridge.ts`.
import type { Extension, ExtensionMessageTarget } from '@tezos-x/octez.connect-types';

/** How the wallet identifies itself in Beacon's extension discovery. */
export const BEACON_WALLET_NAME = 'TezosX Wallet';

/**
 * Where `content/beacon-announce.ts` hands buffered frames to
 * `content/beacon-bridge.ts`, on the ISOLATED world's `window`. The announce half
 * is import-free by necessity (see its header) so it repeats this literal;
 * `beacon-announce.test.ts` asserts the two agree.
 */
export const BEACON_HANDOFF_KEY = '__tezosxBeaconHandoff';

/**
 * Beacon's two `ExtensionMessageTarget` values as plain literals, so no value
 * import of the enum is needed. `page-frames.test.ts` pins both against the real
 * enum, so a rename in the SDK fails a test rather than going silently unmatched.
 */
export const TO_EXTENSION: ExtensionMessageTarget.EXTENSION = 'toExtension' as ExtensionMessageTarget.EXTENSION;
export const TO_PAGE:      ExtensionMessageTarget.PAGE      = 'toPage'      as ExtensionMessageTarget.PAGE;

/** A wallet→page Beacon frame, before the content script stamps `sender`. */
export type ToPageFrame =
  | { target: ExtensionMessageTarget.PAGE; payload: string }
  | { target: ExtensionMessageTarget.PAGE; encryptedPayload: string };

/** Post one frame to the page. Injected so no module here touches `window`. */
export type PostToPage = (frame: ToPageFrame) => void;

/**
 * What an inbound page frame means. `ignore` covers everything that is not
 * addressed to this wallet — the EIP-1193 bridge's own traffic on the same
 * window, another extension's pairing, and our own outbound frames coming back.
 */
export type InboundFrame =
  | { kind: 'ping' }
  | { kind: 'pairing'; payload:          string }
  | { kind: 'message'; encryptedPayload: string }
  | { kind: 'ignore' };

const IGNORE: InboundFrame = { kind: 'ignore' };

/**
 * Classify one `window` message payload.
 *
 * `targetId` is how a dApp addresses ONE of several installed wallets, picked
 * from Beacon's pairing modal: `sendPairingRequest(extension.id)` and
 * `PostMessageClient.sendMessage` both stamp it. A frame stamped for a different
 * extension is not ours to answer — answering it is how three installed wallets
 * turn into "which popup am I confirming?". The discovery ping carries no
 * `targetId` (it is a broadcast) and is always answered.
 */
export function classifyPageFrame(data: unknown, extensionId: string): InboundFrame {
  if (data == null || typeof data !== 'object') return IGNORE;
  const frame = data as {
    target?:           unknown;
    targetId?:         unknown;
    payload?:          unknown;
    encryptedPayload?: unknown;
  };

  if (frame.target !== TO_EXTENSION) return IGNORE;

  if (frame.payload === 'ping') return { kind: 'ping' };

  // `targetId` may be this extension's id, or that id plus a suffix: the
  // announce half publishes a second discovery answer under a derived id to
  // clear beacon-ui's `types.length` guard (see `content/beacon-announce.ts`),
  // and the dApp stamps whichever of the merged group's ids came first. Real ids
  // are fixed-length, so nothing but this extension can produce a value that
  // starts with this extension's id.
  if (
    frame.targetId != null &&
    (typeof frame.targetId !== 'string' || !frame.targetId.startsWith(extensionId))
  ) {
    return IGNORE;
  }

  if (typeof frame.encryptedPayload === 'string' && frame.encryptedPayload !== '') {
    return { kind: 'message', encryptedPayload: frame.encryptedPayload };
  }
  if (typeof frame.payload === 'string' && frame.payload !== '') {
    return { kind: 'pairing', payload: frame.payload };
  }
  return IGNORE;
}

/**
 * The discovery answer. FLAT, not nested under `message` — see the module note.
 * `sender` is a Beacon `Extension`; its `name` is what the dApp's pairing modal
 * lists and, once paired, what the MAPS dApp prints as `paired wallet:`.
 */
export function buildPongFrame(extension: Extension): {
  target:  ExtensionMessageTarget.PAGE;
  payload: 'pong';
  sender:  Extension;
} {
  return { target: TO_PAGE, payload: 'pong', sender: extension };
}

/** Wrap a transport frame in the envelope the dApp's readers expect. */
export function wrapToPageFrame(
  frame:       ToPageFrame,
  extensionId: string,
): { message: ToPageFrame; sender: { id: string } } {
  return { message: frame, sender: { id: extensionId } };
}

/** The fields of a `postmessage-pairing-request` the wallet actually needs. */
export interface PairingRequestFields {
  id:        string;
  name:      string;
  publicKey: string;
  version:   string;
}

/**
 * Longest page-supplied string kept on a pairing record.
 *
 * A pairing is accepted WITHOUT a user prompt — the wallet has to answer the
 * channel-open before a dApp can ask for anything — and the accepted peer is
 * persisted to `chrome.storage.local`, the same 10 MB namespace the encrypted
 * vault lives in. `id`, `name` and `version` are all page-chosen and none is
 * needed at length: `version` is `'3'`, `id` is a GUID, and `name` is only ever
 * displayed. Without a clamp, one pairing frame carrying a multi-megabyte `name`
 * fills the namespace in a single write and the wallet can no longer save its
 * own vault.
 */
const MAX_PAIRING_FIELD = 128;

/**
 * Validate a deserialized pairing request.
 *
 * `Serializer.deserialize` only guarantees "it was valid bs58check-wrapped
 * JSON"; the object inside is page-supplied. `publicKey` is the one field that
 * must be right — it is fed to a cryptobox — so it is checked as 64 hex
 * characters (an ed25519 public key) rather than merely "a string". The rest are
 * length-clamped rather than rejected on length, so a dApp with a long display
 * name still pairs.
 */
export function readPairingRequest(value: unknown): PairingRequestFields | null {
  if (value == null || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.type !== 'postmessage-pairing-request') return null;
  if (typeof v.id !== 'string' || v.id === '') return null;
  if (typeof v.publicKey !== 'string' || !/^[0-9a-f]{64}$/i.test(v.publicKey)) return null;
  if (typeof v.version !== 'string' || v.version === '') return null;
  return {
    id:        v.id.slice(0, MAX_PAIRING_FIELD),
    // A nameless dApp is allowed; it is only ever displayed.
    name:      typeof v.name === 'string' ? v.name.slice(0, MAX_PAIRING_FIELD) : 'Unknown dApp',
    publicKey: v.publicKey,
    version:   v.version.slice(0, MAX_PAIRING_FIELD),
  };
}
