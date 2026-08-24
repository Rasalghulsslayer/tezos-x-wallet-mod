import { describe, expect, it } from 'vitest';
import { BeaconErrorType, BeaconMessageType, NetworkType, PermissionScope } from '@airgap/beacon-types';
import { getAddressFromPublicKey, isValidAddress, prefixPublicKey } from '@airgap/beacon-utils';
import { WALLET_BEACON_NETWORK, type BeaconPermissionGrant } from '@tezosx/wallet-core/domain/beacon';
import {
  beaconErrorFor,
  errorResponseFor,
  narrowPermissionRequest,
  permissionResponseFor,
  toSdkNetwork,
} from '../responses';

const PREVIEWNET_MICHELSON_RPC = 'https://michelson.previewnet.tezosx.nomadic-labs.com';

/** A real tz1 / edpk pair, so Beacon's own address derivation can be exercised. */
const TZ1    = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb';
const EDPK   = 'edpkvGfYw3LyB1UcCahKQk4rF2tvbMUk8GFiTuMjL75uGXrpvKXhjn';

const GRANT: BeaconPermissionGrant = {
  address:   TZ1,
  publicKey: EDPK,
  network:   WALLET_BEACON_NETWORK,
  scopes:    ['operation_request'],
};

/**
 * ── THE HARD GATE, COPIED VERBATIM FROM THE dApp ──────────────────────────────
 *
 * `checkBeaconNetwork` and `sameRpc` from the MAPS dApp's
 * `frontend/src/web3/beacon.ts:135-186` (worktree `m4.8-wizard-one-click`),
 * transcribed rather than imported — that repo is a separate, read-only checkout.
 *
 * It is reproduced instead of paraphrased on purpose: it is the thing that
 * decides whether this wallet connects at all, and it reads
 * `getActiveAccount().network`, which is whatever the wallet's permission
 * response said. Asserting our own shape proves nothing; running the actual
 * judge does. `rpcUrl` DECIDES; a missing one is a refusal, never a pass.
 */
function dappSameRpc(a: string, b: string): boolean {
  const norm = (u: string): string => {
    try {
      const p = new URL(u);
      return `${p.protocol}//${p.host}${p.pathname}`.toLowerCase().replace(/\/+$/, '');
    } catch {
      return u.trim().toLowerCase().replace(/\/+$/, '');
    }
  };
  return norm(a) === norm(b);
}

function dappCheckBeaconNetwork(
  net: { type?: string; name?: string; rpcUrl?: string } | null | undefined,
): { ok: boolean; reason: string } {
  if (!net) return { ok: false, reason: 'the wallet reported no network at all' };
  if (net.rpcUrl) {
    return dappSameRpc(net.rpcUrl, PREVIEWNET_MICHELSON_RPC)
      ? { ok: true, reason: `rpcUrl matches ${PREVIEWNET_MICHELSON_RPC}` }
      : { ok: false, reason: `the wallet signs against ${net.rpcUrl}, not ${PREVIEWNET_MICHELSON_RPC}` };
  }
  return { ok: false, reason: 'the wallet reported no rpcUrl' };
}

/**
 * `DAppClient.onNewAccount`, the part that can reject our response
 * (`@ecadlabs/beacon-dapp/dist/esm/dapp-client/DAppClient.js:1970-1995`, and
 * identical in the `@airgap` build). Transcribed for the same reason.
 */
async function dappOnNewAccount(message: {
  publicKey?: string; address?: string; network: unknown; scopes: unknown;
}): Promise<{ address: string; publicKey: string | undefined; network: unknown; scopes: unknown }> {
  const tempPK = message.publicKey;
  const publicKey = tempPK != null && tempPK !== '' ? prefixPublicKey(tempPK) : undefined;
  if (publicKey == null && message.address == null) {
    throw new Error('PublicKey or Address must be defined');
  }
  const address = message.address ?? (await getAddressFromPublicKey(publicKey as string));
  if (!isValidAddress(address)) throw new Error(`Invalid address: "${address}"`);
  return { address, publicKey, network: message.network, scopes: message.scopes };
}

describe('permissionResponseFor — against the dApp that judges it', () => {
  it('PASSES the dApp network gate', async () => {
    const response = permissionResponseFor('req-1', GRANT);
    if (response.type !== BeaconMessageType.PermissionResponse) throw new Error('unreachable');

    const account = await dappOnNewAccount({
      publicKey: response.publicKey,
      address:   response.address,
      network:   response.network,
      scopes:    response.scopes,
    });
    const verdict = dappCheckBeaconNetwork(
      account.network != null
        ? { ...(account.network as { type: string; name?: string; rpcUrl?: string }) }
        : null,
    );
    expect(verdict.ok, verdict.reason).toBe(true);
    expect(verdict.reason).toContain(PREVIEWNET_MICHELSON_RPC);
  });

  it('produces exactly the line the dApp prints: `<name> @ <rpcUrl>`', () => {
    const response = permissionResponseFor('req-1', GRANT);
    if (response.type !== BeaconMessageType.PermissionResponse) throw new Error('unreachable');
    const net = response.network;
    // `[MAPS wallet] network gate OK: ${net?.name ?? net?.type ?? 'custom'} @ ${net?.rpcUrl}`
    expect(`${net.name ?? net.type ?? 'custom'} @ ${net.rpcUrl}`)
      .toBe(`Tezos X previewnet @ ${PREVIEWNET_MICHELSON_RPC}`);
  });

  it('survives the dApp deriving the address from the public key alone', async () => {
    // onNewAccount only derives when `address` is absent. Sending both means the
    // tz1 the user approved is the tz1 the dApp shows — so the two must agree.
    const derived = await getAddressFromPublicKey(EDPK);
    expect(derived).toBe(TZ1);
  });

  it('carries both address and publicKey, and a valid tz1', async () => {
    const response = permissionResponseFor('req-1', GRANT);
    if (response.type !== BeaconMessageType.PermissionResponse) throw new Error('unreachable');
    expect(response.address).toBe(TZ1);
    expect(response.publicKey).toBe(EDPK);
    expect(isValidAddress(response.address as string)).toBe(true);
  });

  it('declares walletType implicit — a tz1 is not an abstracted account', () => {
    const response = permissionResponseFor('req-1', GRANT);
    if (response.type !== BeaconMessageType.PermissionResponse) throw new Error('unreachable');
    // Beacon rejects `abstracted_account` outright for a non-KT1 address.
    expect(response.walletType).toBe('implicit');
  });

  it('echoes the request id, which is how the SDK matches the pending request', () => {
    const response = permissionResponseFor('req-abc', GRANT);
    expect(response.id).toBe('req-abc');
  });

  it('leaves senderId, version and appMetadata to the SDK to fill in', () => {
    const response = permissionResponseFor('req-1', GRANT);
    // OutgoingResponseInterceptor supplies all three; setting them here would
    // either be overwritten or wrong.
    expect('senderId' in response).toBe(false);
    expect('version' in response).toBe(false);
    expect('appMetadata' in response).toBe(false);
  });

  it('emits scopes as SDK PermissionScope values', () => {
    const response = permissionResponseFor('req-1', GRANT);
    if (response.type !== BeaconMessageType.PermissionResponse) throw new Error('unreachable');
    expect(response.scopes).toEqual([PermissionScope.OPERATION_REQUEST]);
  });

  it('drops a scope string the SDK does not define rather than passing it through', () => {
    const response = permissionResponseFor('req-1', { ...GRANT, scopes: ['operation_request', 'not_a_scope'] });
    if (response.type !== BeaconMessageType.PermissionResponse) throw new Error('unreachable');
    expect(response.scopes).toEqual([PermissionScope.OPERATION_REQUEST]);
  });
});

describe('toSdkNetwork', () => {
  it("maps core's plain 'custom' onto NetworkType.CUSTOM", () => {
    expect(toSdkNetwork(WALLET_BEACON_NETWORK).type).toBe(NetworkType.CUSTOM);
  });

  it('carries name and rpcUrl through unchanged', () => {
    expect(toSdkNetwork(WALLET_BEACON_NETWORK)).toEqual({
      type:   NetworkType.CUSTOM,
      name:   'Tezos X previewnet',
      rpcUrl: PREVIEWNET_MICHELSON_RPC,
    });
  });
});

describe('beaconErrorFor', () => {
  it('maps a user rejection to ABORTED_ERROR, which is what the dApp branches on', () => {
    expect(beaconErrorFor(4001)).toBe(BeaconErrorType.ABORTED_ERROR);
  });

  it('maps a wrong-network refusal to NETWORK_NOT_SUPPORTED', () => {
    expect(beaconErrorFor(5001)).toBe(BeaconErrorType.NETWORK_NOT_SUPPORTED);
  });

  it('maps an EVM-source active account to NO_ADDRESS_ERROR', () => {
    expect(beaconErrorFor(5002)).toBe(BeaconErrorType.NO_ADDRESS_ERROR);
  });

  it('falls back to ABORTED_ERROR for a locked wallet, the flood cap, and internals', () => {
    // Coarse on the wire by design; the envelope message carries the reason and
    // the content script logs it.
    for (const code of [4100, -32005, -32603, 0]) {
      expect(beaconErrorFor(code), String(code)).toBe(BeaconErrorType.ABORTED_ERROR);
    }
  });

  it('maps "not connected" to NOT_GRANTED, distinct from a user abort', () => {
    // A dApp must be able to tell "you never connected" from "the user said no",
    // because only one of the two is fixed by connecting.
    expect(beaconErrorFor(5003)).toBe(BeaconErrorType.NOT_GRANTED_ERROR);
  });

  it('maps an approved-then-failed operation to BROADCAST_ERROR, never ABORTED', () => {
    // The operator confirmed it. Reporting an abort would blame them for a
    // simulation refusal or a fee below the floor — the mislabelling that made
    // previewnet failures undiagnosable through Temple.
    expect(beaconErrorFor(5004)).toBe(BeaconErrorType.BROADCAST_ERROR);
  });

  it('maps a malformed operation to PARAMETERS_INVALID', () => {
    expect(beaconErrorFor(-32602)).toBe(BeaconErrorType.PARAMETERS_INVALID_ERROR);
  });

  it('only ever returns a BeaconErrorType the SDK defines', () => {
    const known = new Set<string>(Object.values(BeaconErrorType));
    for (const code of [4001, 4100, 5001, 5002, -32005, -32603, 12345]) {
      expect(known.has(beaconErrorFor(code))).toBe(true);
    }
  });
});

describe('errorResponseFor', () => {
  it('is a real Error message with an errorType, not a thrown string', () => {
    // A thrown string never reaches the dApp: the request just never answers.
    expect(errorResponseFor('req-1', BeaconErrorType.ABORTED_ERROR)).toEqual({
      type:      BeaconMessageType.Error,
      id:        'req-1',
      errorType: BeaconErrorType.ABORTED_ERROR,
    });
  });
});

describe('narrowPermissionRequest', () => {
  it('forwards only the network and the scopes', () => {
    const narrowed = narrowPermissionRequest({
      type:        BeaconMessageType.PermissionRequest,
      id:          'req-1',
      senderId:    'sender-1',
      appMetadata: { senderId: 'sender-1', name: 'MAPS — Multi-Asset Privacy Solution' },
      network:     { type: NetworkType.CUSTOM, name: 'Tezos X previewnet', rpcUrl: PREVIEWNET_MICHELSON_RPC },
      scopes:      [PermissionScope.OPERATION_REQUEST, PermissionScope.SIGN],
    });
    expect(narrowed).toEqual({
      kind:    'permission',
      network: { type: 'custom', name: 'Tezos X previewnet', rpcUrl: PREVIEWNET_MICHELSON_RPC },
      scopes:  ['operation_request', 'sign'],
    });
  });

  // `Serializer.deserialize` is bs58check + JSON.parse, and
  // IncomingRequestInterceptor re-emits the message untouched apart from
  // appMetadata — so `network` and `scopes` arrive exactly as the page wrote
  // them, and their static types are a promise nobody checked. A non-string
  // rpcUrl reaching sameRpcUrl used to throw a TypeError in the service worker
  // OUTSIDE any try/catch: sendResponse never fired and the dApp waited forever.
  it('drops a network whose rpcUrl is not a string', () => {
    for (const rpcUrl of [123, true, {}, ['x'], null]) {
      const narrowed = narrowPermissionRequest({
        type: BeaconMessageType.PermissionRequest, id: 'r', senderId: 's',
        appMetadata: { senderId: 's', name: 'MAPS' },
        network: { type: NetworkType.CUSTOM, rpcUrl } as never,
        scopes: [PermissionScope.OPERATION_REQUEST],
      });
      expect(narrowed.network?.rpcUrl, String(rpcUrl)).toBeUndefined();
      // The type is still carried, so a non-custom network is still refused.
      expect(narrowed.network?.type).toBe('custom');
    }
  });

  it('drops a network that is not an object, or whose type is not a string', () => {
    for (const network of [123, 'mainnet', [], true, { name: 'x' }, { type: 5 }]) {
      const narrowed = narrowPermissionRequest({
        type: BeaconMessageType.PermissionRequest, id: 'r', senderId: 's',
        appMetadata: { senderId: 's', name: 'MAPS' },
        network: network as never,
        scopes: [PermissionScope.OPERATION_REQUEST],
      });
      expect(narrowed.network, JSON.stringify(network)).toBeUndefined();
    }
  });

  it('drops a name that is not a string but keeps the rest', () => {
    const narrowed = narrowPermissionRequest({
      type: BeaconMessageType.PermissionRequest, id: 'r', senderId: 's',
      appMetadata: { senderId: 's', name: 'MAPS' },
      network: { type: NetworkType.CUSTOM, name: 99, rpcUrl: PREVIEWNET_MICHELSON_RPC } as never,
      scopes: [PermissionScope.OPERATION_REQUEST],
    });
    expect(narrowed.network).toEqual({ type: 'custom', name: undefined, rpcUrl: PREVIEWNET_MICHELSON_RPC });
  });

  it('drops scopes that are not an array', () => {
    for (const scopes of [5, {}, true, 'operation_request']) {
      const narrowed = narrowPermissionRequest({
        type: BeaconMessageType.PermissionRequest, id: 'r', senderId: 's',
        appMetadata: { senderId: 's', name: 'MAPS' },
        network: { type: NetworkType.CUSTOM, rpcUrl: PREVIEWNET_MICHELSON_RPC },
        scopes: scopes as never,
      });
      expect(narrowed.scopes, String(scopes)).toBeUndefined();
    }
  });

  it('keeps only the string entries of a mixed scopes array', () => {
    const narrowed = narrowPermissionRequest({
      type: BeaconMessageType.PermissionRequest, id: 'r', senderId: 's',
      appMetadata: { senderId: 's', name: 'MAPS' },
      network: { type: NetworkType.CUSTOM, rpcUrl: PREVIEWNET_MICHELSON_RPC },
      scopes: ['operation_request', 7, null, 'sign'] as never,
    });
    expect(narrowed.scopes).toEqual(['operation_request', 'sign']);
  });

  it('does not forward the page-chosen app name — origin is what identifies a site', () => {
    const narrowed = narrowPermissionRequest({
      type:        BeaconMessageType.PermissionRequest,
      id:          'req-1',
      senderId:    'sender-1',
      appMetadata: { senderId: 'sender-1', name: 'Definitely Your Bank' },
      network:     { type: NetworkType.CUSTOM, rpcUrl: PREVIEWNET_MICHELSON_RPC },
      scopes:      [PermissionScope.OPERATION_REQUEST],
    });
    expect(JSON.stringify(narrowed)).not.toContain('Definitely Your Bank');
  });
});
