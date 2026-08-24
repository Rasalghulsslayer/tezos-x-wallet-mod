/**
 * Translation between the wallet's own `WalletResponse` envelope and the Beacon
 * messages the SDK sends back to a dApp.
 *
 * Kept pure and separate from the content script so the exact shape of a
 * permission response — the thing a dApp-side network gate judges the wallet on
 * — is unit-testable without a window, a WalletClient, or a live dApp.
 */

import {
  BeaconErrorType,
  BeaconMessageType,
  PermissionScope,
  type BeaconResponseInputMessage,
  type Network,
  type NetworkType,
  type PermissionRequestOutput,
} from '@airgap/beacon-types';
import {
  BEACON_NETWORK_NOT_SUPPORTED,
  BEACON_NO_ADDRESS,
  type BeaconNetwork,
  type BeaconPermissionGrant,
} from '@tezosx/wallet-core/domain/beacon';
import type { BeaconPermissionRequest } from '@tezosx/wallet-core/shared/messages';

/** EIP-1193 4001, the code the router returns for a user rejection. */
const EIP_USER_REJECTED = 4001;

/**
 * Envelope code → the Beacon error the SDK expects.
 *
 * A refusal must arrive as a real `BeaconMessageType.Error` with an `errorType`,
 * never as a thrown string: `DAppClient` turns the `errorType` into the typed
 * error its callers branch on (`AbortedBeaconError`,
 * `NetworkNotSupportedBeaconError`, …), and a thrown string reaches the dApp as
 * an unresolved request that simply never answers.
 *
 * Everything unmapped — a locked wallet, the per-origin flood cap, an internal
 * failure — becomes `ABORTED_ERROR`, which the SDK documents as "aborted by the
 * user OR THE WALLET". The envelope's own message is logged alongside so the
 * reason is not lost, only the wire code is coarse.
 */
export function beaconErrorFor(code: number): BeaconErrorType {
  switch (code) {
    case BEACON_NETWORK_NOT_SUPPORTED: return BeaconErrorType.NETWORK_NOT_SUPPORTED;
    case BEACON_NO_ADDRESS:            return BeaconErrorType.NO_ADDRESS_ERROR;
    case EIP_USER_REJECTED:            return BeaconErrorType.ABORTED_ERROR;
    default:                           return BeaconErrorType.ABORTED_ERROR;
  }
}

const KNOWN_SCOPES = new Set<string>(Object.values(PermissionScope));

/** Keep only scope strings the SDK actually defines. */
function toSdkScopes(scopes: readonly string[]): PermissionScope[] {
  return scopes.filter((s): s is PermissionScope => KNOWN_SCOPES.has(s));
}

/**
 * Core states the network as plain strings (it must not import the SDK); the SDK
 * types `type` as its `NetworkType` enum. Every member of that enum is its own
 * string value, so the cast is a re-labelling, not a claim — and `'custom'`, the
 * only value the wallet ever reports, is `NetworkType.CUSTOM`.
 */
export function toSdkNetwork(net: BeaconNetwork): Network {
  return { type: net.type as NetworkType, name: net.name, rpcUrl: net.rpcUrl };
}

/**
 * The `permission_response` for a granted request.
 *
 * Every field is load-bearing for the MAPS dApp's connect path:
 *
 *  - `publicKey` — `DAppClient.onNewAccount` requires a public key or an
 *    address, prefixes it, and derives the address from it. Sent as the
 *    `edpk…` the keyring holds.
 *  - `address` — sent as well as the public key, not instead of it, so the tz1
 *    the user approved in the wallet is the tz1 the dApp shows. Beacon
 *    cross-checks it with `isValidAddress`.
 *  - `network` — carries the wallet's OWN rpcUrl. This is what the dApp's gate
 *    reads off `getActiveAccount().network` and decides on, and it is why the
 *    request's network is checked rather than echoed: echoing would leave the
 *    dApp checking its own question.
 *  - `scopes` — what was granted, which may be narrower than what was asked.
 *  - `walletType: 'implicit'` — required by the type, and true: a tz1 key, not
 *    an abstracted (KT1) account. Claiming `abstracted_account` for a tz1 makes
 *    Beacon reject the response outright.
 */
export function permissionResponseFor(
  id:    string,
  grant: BeaconPermissionGrant,
): BeaconResponseInputMessage {
  return {
    type:       BeaconMessageType.PermissionResponse,
    id,
    address:    grant.address,
    publicKey:  grant.publicKey,
    network:    toSdkNetwork(grant.network),
    scopes:     toSdkScopes(grant.scopes),
    walletType: 'implicit',
  };
}

/** A refusal the SDK can turn into a typed error on the dApp side. */
export function errorResponseFor(id: string, errorType: BeaconErrorType): BeaconResponseInputMessage {
  return { type: BeaconMessageType.Error, id, errorType };
}

/**
 * Narrow a Beacon `permission_request` down to what the service worker needs.
 *
 * The SW never sees the raw Beacon message: it gets the network to check and the
 * scopes to intersect, and nothing else. `appMetadata.name` is deliberately not
 * forwarded — the approval screen identifies a site by the origin the browser
 * attests, never by a name the page chose for itself.
 */
export function narrowPermissionRequest(req: PermissionRequestOutput): BeaconPermissionRequest {
  return {
    kind:    'permission',
    network: readNetwork(req.network),
    scopes:  readScopes(req.scopes),
  };
}

/**
 * Keep the request's network only if its fields are the strings the type claims.
 *
 * `Serializer.deserialize` is bs58check plus `JSON.parse`, and
 * `IncomingRequestInterceptor` re-emits the message untouched apart from
 * `appMetadata` — so `network` arrives exactly as the page wrote it, and its
 * static type is a promise nobody checked. A non-string `rpcUrl` reaching
 * `sameRpcUrl` makes `new URL(…)` throw and the fallback `u.trim()` throw again,
 * and `handleBeaconRequest` sits OUTSIDE the router's try/catch: the rejection
 * escapes into the service worker's message listener, `sendResponse` is never
 * called, and the dApp waits on a request that will never be answered.
 *
 * Dropping a malformed network rather than refusing the connection: absent means
 * "the dApp pinned nothing", and the response still states the wallet's own
 * network, which its gate then judges. A page cannot gain anything by sending
 * rubbish here.
 */
function readNetwork(network: unknown): BeaconNetwork | undefined {
  if (network == null || typeof network !== 'object') return undefined;
  const n = network as { type?: unknown; name?: unknown; rpcUrl?: unknown };
  if (typeof n.type !== 'string') return undefined;
  return {
    type:   n.type,
    name:   typeof n.name   === 'string' ? n.name   : undefined,
    rpcUrl: typeof n.rpcUrl === 'string' ? n.rpcUrl : undefined,
  };
}

/** Keep only a genuine array of strings; anything else means "none named". */
function readScopes(scopes: unknown): readonly string[] | undefined {
  if (!Array.isArray(scopes)) return undefined;
  return scopes.filter((s): s is string => typeof s === 'string');
}
