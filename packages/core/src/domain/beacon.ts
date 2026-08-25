/**
 * The Beacon facts the service worker needs, expressed WITHOUT importing
 * `@airgap/beacon-*`.
 *
 * The SDK's wallet side needs a real `window` (see the note on the extension
 * transport in `packages/wallet/src/shared/beacon/`), so it runs in the content
 * script. The content script narrows a Beacon `permission_request` down to the
 * few fields below and hands those to `dispatch`; core never parses a Beacon
 * message, never loads the SDK, and cannot be steered by a field the page
 * invented. Same shape as the mobile shell's WalletConnect seam, which
 * translates a `session_proposal` into an `EthereumRequest` before dispatching.
 */

import { TEZOS_L1_RPC } from '@tezosx/relayer/constants';

/**
 * Beacon's `Network`. `rpcUrl` is optional in the SDK's own type — which is
 * exactly why a dApp cannot take it on trust, and why ours always sets it.
 */
export interface BeaconNetwork {
  type:    string;
  name?:   string;
  rpcUrl?: string;
}

/**
 * The network this wallet actually signs on, reported verbatim in every
 * permission response.
 *
 * `rpcUrl` is sourced from the same `TEZOS_L1_RPC` constant that `TezosSigner`
 * hands to its `TezosToolkit`, so the answer cannot drift from where operations
 * are really injected — the drift is the whole failure mode a dApp-side network
 * gate exists to catch.
 *
 * `type: 'custom'` (not a built-in `NetworkType`) because previewnet is not a
 * network any Beacon SDK version knows: naming a built-in type earns a
 * `ParametersInvalidBeaconError` the moment it disagrees with the peer.
 */
export const WALLET_BEACON_NETWORK: BeaconNetwork = {
  type:   'custom',
  name:   'Tezos X previewnet',
  rpcUrl: TEZOS_L1_RPC,
};

/**
 * Beacon `PermissionScope` values this wallet can honour.
 *
 * `operation_request` only. `sign` (`sign_payload_request`) is deliberately
 * absent: nothing in the wallet can produce a Tezos payload signature for a
 * dApp today, and granting a scope we cannot serve would make the dApp's own
 * `checkPermissions` gate lie on our behalf. A dApp that needs it is told so
 * by its absence, at connect time, rather than by a failure mid-ceremony.
 */
export const BEACON_GRANTABLE_SCOPES: readonly string[] = ['operation_request'];

/**
 * Envelope codes for the Beacon surface, internal to the extension: the content
 * script maps each to a `BeaconErrorType` before anything reaches a page, so
 * these numbers are never observable from a dApp. Kept clear of the EIP-1193
 * (4xxx) and JSON-RPC (-32xxx) ranges so a Beacon refusal can never be read as
 * an EIP-1193 one.
 */
export const BEACON_NETWORK_NOT_SUPPORTED = 5001;
export const BEACON_NO_ADDRESS            = 5002;
/** The origin holds no Beacon permission — it must connect first. */
export const BEACON_NOT_CONNECTED         = 5003;
/**
 * An approved operation failed on the way to the chain: refused by simulation, a
 * fee below the floor, an injection error. Distinct from a user rejection on
 * purpose — telling a dApp the operator aborted something they in fact confirmed
 * is the mislabelling that made previewnet failures undiagnosable through Temple.
 */
export const BEACON_OPERATION_FAILED      = 5004;

/** What the wallet answers a granted `permission_request` with. */
export interface BeaconPermissionGrant {
  /** tz1 of the connecting account. */
  address:   string;
  /** Its `edpk…` public key. Beacon derives the address from this and checks. */
  publicKey: string;
  network:   BeaconNetwork;
  scopes:    string[];
}

export type BeaconNetworkVerdict =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Compare two RPC URLs by origin + path, ignoring case and a trailing slash.
 * Deliberately the same normalisation the MAPS dApp's `checkBeaconNetwork`
 * applies to our answer: if the two sides normalised differently, one of them
 * would refuse a URL the other considered a match.
 */
export function sameRpcUrl(a: string, b: string): boolean {
  const norm = (u: string): string => {
    try {
      const p = new URL(u);
      return `${p.protocol}//${p.host}${p.pathname}`.toLowerCase().replace(/\/+$/, '');
    } catch {
      // `String(u)` rather than `u.trim()`: the shells validate before calling,
      // but this is core — it is reached from the extension and from mobile, and
      // a comparison helper that can THROW on a value the type merely promised is
      // a worse failure than one that returns false. The router runs outside a
      // try/catch, so a throw here answers nothing at all.
      return String(u).trim().toLowerCase().replace(/\/+$/, '');
    }
  };
  return norm(a) === norm(b);
}

/**
 * Refuse a permission request that pins a network this wallet does not serve.
 *
 * This is the wallet-side half of the same guard, and it fails closed on the
 * one thing that decides where operations land: a stated `rpcUrl` that is not
 * ours is a refusal, and a stated non-`custom` network type (`mainnet`,
 * `ghostnet`, `shadownet`, …) is a refusal, because this wallet only ever signs
 * on previewnet. A request that pins nothing is allowed through — the response
 * then states our network explicitly, and the dApp's own gate decides.
 */
export function checkRequestedNetwork(net: BeaconNetwork | undefined): BeaconNetworkVerdict {
  if (net == null) return { ok: true };

  if (net.rpcUrl != null && net.rpcUrl !== '') {
    return sameRpcUrl(net.rpcUrl, TEZOS_L1_RPC)
      ? { ok: true }
      : {
          ok:     false,
          reason:
            `This wallet signs on ${TEZOS_L1_RPC}; the dApp asked for ` +
            `${net.rpcUrl}${net.name != null ? ` (“${net.name}”)` : ''}.`,
        };
  }

  if (net.type !== 'custom') {
    return {
      ok:     false,
      reason:
        `This wallet only signs on Tezos X previewnet (${TEZOS_L1_RPC}); ` +
        `the dApp asked for “${net.type}”.`,
    };
  }

  return { ok: true };
}

/**
 * The scopes to grant: what the dApp asked for, intersected with what the
 * wallet can serve. A request that names no scopes gets everything grantable —
 * mirroring Beacon's own default (`[operation_request, sign]`) narrowed to ours.
 */
export function grantScopes(requested: readonly string[] | undefined): string[] {
  // `Array.isArray` and not just a null check, for the same reason as
  // `sameRpcUrl`'s `String(u)`: a non-array here would throw on `.includes`, and
  // this runs before the approval prompt on one path and after it on another.
  if (!Array.isArray(requested) || requested.length === 0) return [...BEACON_GRANTABLE_SCOPES];
  return BEACON_GRANTABLE_SCOPES.filter((s) => requested.includes(s));
}
