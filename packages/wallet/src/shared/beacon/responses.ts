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
  TezosOperationType,
  type BeaconResponseInputMessage,
  type Network,
  type NetworkType,
  type OperationRequestOutput,
  type PermissionRequestOutput,
} from '@airgap/beacon-types';
import {
  BEACON_NETWORK_NOT_SUPPORTED,
  BEACON_NOT_CONNECTED,
  BEACON_NO_ADDRESS,
  BEACON_OPERATION_FAILED,
  type BeaconNetwork,
  type BeaconPermissionGrant,
} from '@tezosx/wallet-core/domain/beacon';
import type { OpLimits } from '@tezosx/wallet-core/domain/tezos-operation';
import type { BeaconOperationRequest, BeaconPermissionRequest } from '@tezosx/wallet-core/shared/messages';

/** EIP-1193 4001, the code the router returns for a user rejection. */
const EIP_USER_REJECTED = 4001;
/** EIP-1193 4100, the code the router returns for a LOCKED wallet — including a
 *  request the wallet withdrew itself by auto-locking mid-flight. */
const EIP_UNAUTHORIZED = 4100;
/** JSON-RPC -32602, the code the router returns for a malformed operation. */
const JSON_RPC_INVALID_PARAMS = -32602;

/**
 * Envelope code → the Beacon error the SDK expects.
 *
 * A refusal must arrive as a real `BeaconMessageType.Error` with an `errorType`,
 * never as a thrown string: `DAppClient` turns the `errorType` into the typed
 * error its callers branch on (`AbortedBeaconError`,
 * `NetworkNotSupportedBeaconError`, …), and a thrown string reaches the dApp as
 * an unresolved request that simply never answers.
 *
 * Everything unmapped — the per-origin flood cap, an internal failure — becomes
 * `ABORTED_ERROR`, which the SDK documents as "aborted by the user OR THE
 * WALLET". The envelope's own message is logged alongside so the reason is not
 * lost, only the wire code is coarse.
 */
export function beaconErrorFor(code: number): BeaconErrorType {
  switch (code) {
    case BEACON_NETWORK_NOT_SUPPORTED: return BeaconErrorType.NETWORK_NOT_SUPPORTED;
    case BEACON_NO_ADDRESS:            return BeaconErrorType.NO_ADDRESS_ERROR;
    // The origin holds no grant. NOT_GRANTED is the SDK's own word for it, and
    // keeping it distinct from ABORTED is what lets a dApp tell "you never
    // connected" from "the user said no".
    case BEACON_NOT_CONNECTED:         return BeaconErrorType.NOT_GRANTED_ERROR;
    // Approved, then failed on the way to the chain. BROADCAST_ERROR is the
    // member the SDK documents for exactly this ("the transaction is broadcast
    // but there is an error"), and it must not be ABORTED: telling a dApp the
    // operator aborted something they in fact confirmed is the mislabelling that
    // made previewnet failures undiagnosable through Temple.
    case BEACON_OPERATION_FAILED:      return BeaconErrorType.BROADCAST_ERROR;
    case JSON_RPC_INVALID_PARAMS:      return BeaconErrorType.PARAMETERS_INVALID_ERROR;
    case EIP_USER_REJECTED:            return BeaconErrorType.ABORTED_ERROR;
    // ⚠️ A LOCKED WALLET IS INDISTINGUISHABLE FROM A USER REJECTION ON THIS
    // WIRE, AND THAT IS THE PROTOCOL'S LIMIT, NOT AN OVERSIGHT. Beacon has no
    // locked-wallet member: `ABORTED_ERROR` is the one the SDK documents for
    // "aborted by the user OR THE WALLET" and the only one returned by
    // Permission | Operation Request | Sign | Broadcast. The near-miss,
    // `NO_PRIVATE_KEY_FOUND_ERROR`, is documented "Returned by: Sign" only, and
    // it would tell a dApp its account was wrong — a worse lie than a coarse
    // truth. So the distinction lives where this wallet controls it: the
    // envelope carries 4100 rather than 4001 and names the trigger, and the
    // content script logs `refused (4100): …` verbatim. That log is what turns
    // "the operator declined" into "the wallet auto-locked" for whoever is
    // reading a ceremony that stopped.
    case EIP_UNAUTHORIZED:             return BeaconErrorType.ABORTED_ERROR;
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

/**
 * The `operation_response` for an injected operation.
 *
 * `transactionHash` — the SDK's field name — carries the L1 operation hash. The
 * dApp then calls `op.confirmation(1)` and reads `operationResults()` off it, so
 * the hash must be of an operation that has actually been injected; answering
 * with a hash of something un-broadcast would leave the dApp polling forever.
 */
export function operationResponseFor(id: string, opHash: string): BeaconResponseInputMessage {
  return { type: BeaconMessageType.OperationResponse, id, transactionHash: opHash };
}

export type OperationNarrowing =
  | { ok: true;  request: BeaconOperationRequest }
  | { ok: false; errorType: BeaconErrorType; reason: string };

/**
 * Narrow a Beacon `operation_request` to the ONE transaction this wallet signs.
 *
 * Everything refused here is refused BEFORE the service worker is involved and
 * before the operator is prompted, because none of it is a judgement call:
 *
 *  - A batch. `operationDetails` is an array and Beacon allows several
 *    operations in one group. This wallet signs one, so a batch is refused with
 *    the SDK's own `TOO_MANY_OPERATIONS` rather than silently signing the first
 *    and reporting success for all of them.
 *  - Any kind other than `transaction` — an origination, a delegation, a reveal.
 *    The wallet has no path for them and must not pretend otherwise.
 *
 * `fee` / `gas_limit` / `storage_limit` are forwarded ONLY as a complete set.
 * Beacon's partial operation type makes each optional independently, and this
 * chain's fee floor couples them, so a half-supplied pin is treated as no pin at
 * all — the wallet then prices the whole operation itself, which is coherent,
 * where honouring one of three numbers would not be.
 */
export function narrowOperationRequest(req: OperationRequestOutput): OperationNarrowing {
  const details = req.operationDetails;
  if (!Array.isArray(details) || details.length === 0) {
    return {
      ok: false, errorType: BeaconErrorType.PARAMETERS_INVALID_ERROR,
      reason: 'The operation request carried no operations',
    };
  }
  if (details.length > 1) {
    return {
      ok: false, errorType: BeaconErrorType.TOO_MANY_OPERATIONS,
      reason: `This wallet signs one operation at a time; the request carried ${details.length}`,
    };
  }

  const op = details[0];
  if (op.kind !== TezosOperationType.TRANSACTION) {
    return {
      ok: false, errorType: BeaconErrorType.PARAMETERS_INVALID_ERROR,
      reason: `Unsupported operation kind "${String(op.kind)}" — this wallet signs transactions only`,
    };
  }

  const tx = op as {
    destination?:   unknown;
    amount?:        unknown;
    fee?:           unknown;
    gas_limit?:     unknown;
    storage_limit?: unknown;
    parameters?:    { entrypoint?: unknown; value?: unknown };
  };

  // The entrypoint and its value travel TOGETHER or not at all. Read
  // independently, a half-supplied `parameters` becomes an operation that renders
  // as a contract call and forges as a plain transfer — the approval screen would
  // name something other than what gets signed. Beacon's own types require both,
  // and Taquito emits the whole object or none, but the dApp hand-writes this
  // literal over a fully-pinned op, so the half-state is reachable on the wire.
  const p = tx.parameters;
  let parameter: BeaconOperationRequest['operation']['parameter'];
  if (p != null) {
    if (typeof p.entrypoint !== 'string' || p.value == null) {
      return {
        ok: false, errorType: BeaconErrorType.PARAMETERS_INVALID_ERROR,
        reason:
          'A transaction parameter needs both an entrypoint and a value; got ' +
          `entrypoint=${JSON.stringify(p.entrypoint)} value=${p.value === undefined ? 'undefined' : 'null'}`,
      };
    }
    parameter = { entrypoint: p.entrypoint, value: p.value as MichelineValue };
  }

  return {
    ok: true,
    request: {
      kind: 'operation',
      operation: {
        // Destination and amount are left as-is when malformed: `checkOperation`
        // in core is the single place that decides what a well-formed operation
        // is, and duplicating that judgement here would give two answers to one
        // question. The parameter is the exception because its well-formedness is
        // a PAIRING question, which core's field-wise check cannot express.
        destination: typeof tx.destination === 'string' ? tx.destination : '',
        amount:      typeof tx.amount      === 'string' ? tx.amount      : String(tx.amount ?? ''),
        parameter,
        limits:      readLimits(tx),
      },
    },
  };
}

type MichelineValue = NonNullable<BeaconOperationRequest['operation']['parameter']>['value'];

/**
 * The dApp's pin, or nothing. Beacon sends the three knobs as decimal STRINGS
 * (Taquito's `createTransferOperation` stringifies them), so they are parsed
 * here — and only accepted as a complete, finite, non-negative set.
 */
function readLimits(tx: {
  fee?: unknown; gas_limit?: unknown; storage_limit?: unknown;
}): OpLimits | undefined {
  const fee     = toWholeNumber(tx.fee);
  const gas     = toWholeNumber(tx.gas_limit);
  const storage = toWholeNumber(tx.storage_limit);
  if (fee == null || gas == null || storage == null) return undefined;
  return { fee, gasLimit: gas, storageLimit: storage };
}

function toWholeNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : undefined;
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
