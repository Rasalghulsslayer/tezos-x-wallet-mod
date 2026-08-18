/**
 * The dispatch catch-all must preserve a numeric `code` carried by a thrown
 * error (the relayer's rpc helper attaches 4900 to network failures) instead
 * of flattening everything to -32603 — the UI dispatches on that code.
 */

import { describe, expect, it } from 'vitest';
import { dispatch, type SwDeps } from '../sw-wiring';
import { EvmAliasCache } from '../../shared/evm-alias-cache';
import type { Keyring } from '../../background/keyring';
import type { ApprovalQueue } from '../../background/approval-queue';
import type { PersistentPorts } from '../../ports/container';
import { ContainerCache } from '../container-cache';

function depsWithKeyring(keyring: Keyring): SwDeps {
  return {
    keyring,
    approvalQueue:    { rejectAll: () => {} } as unknown as ApprovalQueue,
    persistentPorts:  {} as PersistentPorts,
    state:            { container: null },
    aliasCache:       new EvmAliasCache(),
    containerCache:   new ContainerCache(),
    rebuildContainer: async () => {},
    broadcastEvent:   async () => {},
  };
}

const TRUSTED = { channel: 'trusted-ui' as const };

describe('dispatch catch-all — error code preservation', () => {
  it('surfaces a thrown numeric code instead of -32603', async () => {
    const netError: Error & { code?: number } = new Error('Network error calling tez_getTezosEthereumAddress');
    netError.code = 4900;
    const keyring = { hasVault: () => Promise.reject(netError) } as unknown as Keyring;

    const res = await dispatch({ type: 'GET_STATE' }, TRUSTED, depsWithKeyring(keyring));

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4900);
    expect(res.message).toMatch(/tez_getTezosEthereumAddress/);
  });

  it('still falls back to -32603 for uncoded errors', async () => {
    const keyring = { hasVault: () => Promise.reject(new Error('boom')) } as unknown as Keyring;

    const res = await dispatch({ type: 'GET_STATE' }, TRUSTED, depsWithKeyring(keyring));

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(-32603);
  });
});
