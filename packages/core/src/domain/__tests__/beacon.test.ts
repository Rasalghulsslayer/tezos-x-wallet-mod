import { describe, expect, it } from 'vitest';
import { TEZOS_L1_RPC } from '@tezosx/relayer/constants';
import {
  BEACON_GRANTABLE_SCOPES,
  WALLET_BEACON_NETWORK,
  checkRequestedNetwork,
  grantScopes,
  sameRpcUrl,
  type BeaconNetworkVerdict,
} from '../beacon';

const PREVIEWNET_MICHELSON_RPC = 'https://michelson.previewnet.tezosx.nomadic-labs.com';

describe('WALLET_BEACON_NETWORK', () => {
  // The dApp-side gate decides on rpcUrl and nothing else, so this constant IS
  // the connect verdict. Pinned against the literal previewnet URL, not against
  // TEZOS_L1_RPC, so re-pointing the constant fails here rather than silently
  // connecting a dApp to somewhere it refused to go.
  it('reports the previewnet Michelson RPC verbatim', () => {
    expect(WALLET_BEACON_NETWORK.rpcUrl).toBe(PREVIEWNET_MICHELSON_RPC);
  });

  it('is sourced from the same constant TezosSigner injects operations through', () => {
    expect(WALLET_BEACON_NETWORK.rpcUrl).toBe(TEZOS_L1_RPC);
  });

  it('declares a custom network type, never a built-in one', () => {
    // A built-in NetworkType that disagrees with the peer's active network earns
    // a ParametersInvalidBeaconError; previewnet is not a built-in anywhere.
    expect(WALLET_BEACON_NETWORK.type).toBe('custom');
  });

  it('names the network, because the dApp prints the name beside the rpcUrl', () => {
    expect(WALLET_BEACON_NETWORK.name).toBe('Tezos X previewnet');
  });
});

describe('sameRpcUrl', () => {
  it('ignores a trailing slash and case', () => {
    expect(sameRpcUrl(PREVIEWNET_MICHELSON_RPC, `${PREVIEWNET_MICHELSON_RPC}/`)).toBe(true);
    expect(sameRpcUrl(PREVIEWNET_MICHELSON_RPC, PREVIEWNET_MICHELSON_RPC.toUpperCase())).toBe(true);
  });

  it('ignores a query string and fragment, which name no endpoint', () => {
    expect(sameRpcUrl(PREVIEWNET_MICHELSON_RPC, `${PREVIEWNET_MICHELSON_RPC}?x=1#y`)).toBe(true);
  });

  it('separates a different host', () => {
    expect(sameRpcUrl(PREVIEWNET_MICHELSON_RPC, 'https://shadownet.tezosx.nomadic-labs.com')).toBe(false);
  });

  it('separates a different path on the same host', () => {
    expect(sameRpcUrl(PREVIEWNET_MICHELSON_RPC, `${PREVIEWNET_MICHELSON_RPC}/other`)).toBe(false);
  });

  it('falls back to a string compare on an unparseable URL rather than throwing', () => {
    expect(sameRpcUrl('not a url', 'NOT A URL')).toBe(true);
    expect(sameRpcUrl('not a url', PREVIEWNET_MICHELSON_RPC)).toBe(false);
  });
});

describe('checkRequestedNetwork', () => {
  it('accepts the previewnet Michelson RPC', () => {
    expect(checkRequestedNetwork({ type: 'custom', name: 'Tezos X previewnet', rpcUrl: PREVIEWNET_MICHELSON_RPC }))
      .toEqual({ ok: true });
  });

  it('accepts it with a trailing slash', () => {
    expect(checkRequestedNetwork({ type: 'custom', rpcUrl: `${PREVIEWNET_MICHELSON_RPC}/` }).ok).toBe(true);
  });

  // The failure this mirrors is real: a native issuance was signed against
  // Shadownet and only failed because the contracts did not exist there.
  it('refuses a custom network pinned at a different rpcUrl', () => {
    const verdict = checkRequestedNetwork({ type: 'custom', name: 'shadownet', rpcUrl: 'https://shadownet.example/' });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error('unreachable');
    expect(verdict.reason).toContain('https://shadownet.example/');
    expect(verdict.reason).toContain(PREVIEWNET_MICHELSON_RPC);
  });

  it('refuses a named public network even with no rpcUrl', () => {
    for (const type of ['mainnet', 'ghostnet', 'shadownet']) {
      const verdict = checkRequestedNetwork({ type });
      expect(verdict.ok, type).toBe(false);
      if (verdict.ok) throw new Error('unreachable');
      expect(verdict.reason).toContain(type);
    }
  });

  it('lets a request that pins nothing through — the response then states our network', () => {
    // Not a vacuous pass: the answer carries our rpcUrl, and the dApp's own gate
    // decides on it. Refusing here would block every dApp that leaves the
    // network to the wallet.
    expect(checkRequestedNetwork({ type: 'custom' })).toEqual({ ok: true });
    expect(checkRequestedNetwork(undefined)).toEqual({ ok: true });
  });

  it('treats an empty rpcUrl as "not pinned", not as a match', () => {
    expect(checkRequestedNetwork({ type: 'custom', rpcUrl: '' })).toEqual({ ok: true });
    expect(checkRequestedNetwork({ type: 'mainnet', rpcUrl: '' }).ok).toBe(false);
  });
});

describe('core stays robust when a shell feeds it the wrong type', () => {
  // The extension validates at its boundary, but core is also reached from the
  // mobile shell, and `handleBeaconRequest` runs OUTSIDE the router's try/catch —
  // a throw here answers nothing at all rather than answering an error.
  it('sameRpcUrl returns false instead of throwing on a non-string', () => {
    for (const value of [123, true, {}, ['x'], null, undefined]) {
      expect(() => sameRpcUrl(value as unknown as string, PREVIEWNET_MICHELSON_RPC)).not.toThrow();
      expect(sameRpcUrl(value as unknown as string, PREVIEWNET_MICHELSON_RPC), String(value)).toBe(false);
    }
  });

  it('checkRequestedNetwork refuses instead of throwing on a non-string rpcUrl', () => {
    for (const rpcUrl of [123, true, {}, ['x']]) {
      let verdict: BeaconNetworkVerdict | undefined;
      expect(() => {
        verdict = checkRequestedNetwork({ type: 'custom', rpcUrl } as unknown as { type: string; rpcUrl?: string });
      }).not.toThrow();
      expect(verdict?.ok, String(rpcUrl)).toBe(false);
    }
  });

  it('grantScopes returns the grantable set instead of throwing on a non-array', () => {
    for (const scopes of [5, {}, true, 'operation_request']) {
      expect(() => grantScopes(scopes as unknown as string[])).not.toThrow();
      expect(grantScopes(scopes as unknown as string[]), String(scopes))
        .toEqual([...BEACON_GRANTABLE_SCOPES]);
    }
  });
});

describe('grantScopes', () => {
  it('grants operation_request and withholds sign, which the wallet cannot serve', () => {
    // Beacon's own default request is [operation_request, sign]. Granting `sign`
    // would make the dApp's checkPermissions gate pass for a request this wallet
    // has no implementation for.
    expect(grantScopes(['operation_request', 'sign'])).toEqual(['operation_request']);
  });

  it('grants nothing when nothing grantable was asked for', () => {
    expect(grantScopes(['sign'])).toEqual([]);
    expect(grantScopes(['encrypt', 'notification', 'threshold'])).toEqual([]);
  });

  it('grants everything grantable when no scopes were named', () => {
    expect(grantScopes(undefined)).toEqual([...BEACON_GRANTABLE_SCOPES]);
    expect(grantScopes([])).toEqual([...BEACON_GRANTABLE_SCOPES]);
  });

  it('never invents a scope the dApp did not ask for', () => {
    for (const granted of grantScopes(['operation_request'])) {
      expect(BEACON_GRANTABLE_SCOPES).toContain(granted);
    }
  });
});
