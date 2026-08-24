/**
 * `TezosSigner.sendOperation` — the two pricing modes.
 *
 * This is the suite that matters most in the Beacon operation path, because the
 * failure it guards against is expensive and silent. previewnet's fee floor
 * couples the three limit knobs:
 *
 *     required_µtez = 100 + 4 × opBytes + 0.045 × declaredGas
 *
 * (from `mempool/filter`: `minimal_fees: 100`, `minimal_nanotez_per_byte: 4000/1`,
 * `minimal_nanotez_per_gas_unit: 45/1`, measured 2026-08-24 — 4000× and 450×
 * mainnet's rates). So a dApp that pins all three derives its fee FROM the gas it
 * declares. Re-estimating one of them puts the operation under the floor, the
 * node answers `insufficient_fees` at preapply, and the dApp sees a generic
 * abort with no diagnosis. That is the failure that made Temple unusable here.
 *
 * Hence the two assertions this file exists for: a supplied pin reaches
 * `contract.transfer` byte-for-byte AND no estimate is run, and an absent pin
 * falls through to the calibrated buffered-fee path.
 *
 * Taquito is mocked because the alternative is injecting operations against
 * previewnet from a unit test.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { TezosAccount } from '../../../domain/account';

interface TransferLike {
  to?:            string;
  amount?:        number;
  mutez?:         boolean;
  fee?:           number;
  gasLimit?:      number;
  storageLimit?:  number;
  parameter?:     { entrypoint: string; value: unknown };
}

const transferCalls: TransferLike[] = [];
const estimateCalls: TransferLike[] = [];

let estimateResult = { suggestedFeeMutez: 500, gasLimit: 2_149, storageLimit: 0 };
let transferError: Error | null = null;

vi.mock('@taquito/taquito', () => ({
  TezosToolkit: class {
    readonly contract = {
      transfer: async (params: TransferLike) => {
        transferCalls.push(params);
        if (transferError != null) throw transferError;
        return { hash: 'ooTestOpHash' };
      },
    };
    readonly estimate = {
      transfer: async (params: TransferLike) => {
        estimateCalls.push(params);
        return estimateResult;
      },
    };
    setProvider(): void {}
  },
}));

vi.mock('@taquito/signer', () => ({
  InMemorySigner: class { constructor(_secretKey: string) { void _secretKey; } },
}));

const { TezosSigner } = await import('../tezos-signer');

const ACCOUNT: TezosAccount = {
  kind:      'tezos',
  id:        'acct-1',
  tz1:       'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb',
  publicKey: 'edpkvGfYw3LyB1UcCahKQk4rF2tvbMUk8GFiTuMjL75uGXrpvKXhjn',
  createdAt: 0,
};

const GATEWAY = 'KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw';
const PARAM   = { prim: 'Pair', args: [{ string: '0xdead' }] };
/** The live phase-4 wire pin. */
const PIN     = { fee: 5_000, gasLimit: 20_000, storageLimit: 10_000 };

function signer() {
  return new TezosSigner(ACCOUNT, 'edsk-not-used-because-taquito-is-mocked');
}

describe('sendOperation — a PINNED operation', () => {
  beforeEach(() => {
    transferCalls.length = 0;
    estimateCalls.length = 0;
    transferError = null;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('submits the pin byte-for-byte', async () => {
    const hash = await signer().sendOperation({
      to: GATEWAY, mutezAmount: '0', entrypoint: 'call_evm', michelineArg: PARAM, limits: PIN,
    });
    expect(hash).toBe('ooTestOpHash');
    expect(transferCalls).toHaveLength(1);
    expect(transferCalls[0]).toEqual({
      to:           GATEWAY,
      amount:       0,
      mutez:        true,
      parameter:    { entrypoint: 'call_evm', value: PARAM },
      fee:          5_000,
      gasLimit:     20_000,
      storageLimit: 10_000,
    });
  });

  it('runs NO estimate — the whole point', async () => {
    // An estimate here would replace the dApp's measurement with the wallet's
    // guess, and the two are not interchangeable on this chain.
    await signer().sendOperation({ to: GATEWAY, mutezAmount: '0', limits: PIN });
    expect(estimateCalls).toHaveLength(0);
  });

  it('does not add the +1 storage byte the buffered path adds', async () => {
    await signer().sendOperation({ to: GATEWAY, mutezAmount: '0', limits: PIN });
    expect(transferCalls[0].storageLimit).toBe(10_000);
  });

  it('does not retry on failure — a pinned fee is the caller\'s decision', async () => {
    // The buffered path retries once on the node's reported `required`. Doing that
    // to a pin would spend more than the dApp declared and the operator approved.
    transferError = new Error('{"id":"insufficient_fees","required":"90000"}');
    await expect(signer().sendOperation({ to: GATEWAY, mutezAmount: '0', limits: PIN }))
      .rejects.toThrow(/insufficient_fees/);
    expect(transferCalls).toHaveLength(1);
  });

  it('accepts the live deploy pin, which sits at the gas cap exactly', async () => {
    await signer().sendOperation({
      to: GATEWAY, mutezAmount: '0', entrypoint: 'call_evm', michelineArg: PARAM,
      limits: { fee: 500_000, gasLimit: 660_000, storageLimit: 10_000 },
    });
    expect(transferCalls[0].gasLimit).toBe(660_000);
  });

  it('refuses gas over the hard limit BEFORE submitting anything', async () => {
    await expect(signer().sendOperation({
      to: GATEWAY, mutezAmount: '0', limits: { ...PIN, gasLimit: 660_001 },
    })).rejects.toThrow(/cannot be included at any fee/);
    expect(transferCalls).toHaveLength(0);
  });

  it('refuses storage over the hard limit BEFORE submitting anything', async () => {
    await expect(signer().sendOperation({
      to: GATEWAY, mutezAmount: '0', limits: { ...PIN, storageLimit: 60_001 },
    })).rejects.toThrow(/cannot be included at any fee/);
    expect(transferCalls).toHaveLength(0);
  });
});

describe('sendOperation — an UNPINNED operation', () => {
  beforeEach(() => {
    transferCalls.length = 0;
    estimateCalls.length = 0;
    transferError = null;
    estimateResult = { suggestedFeeMutez: 500, gasLimit: 2_149, storageLimit: 0 };
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('prices it through the calibrated buffered-fee path', async () => {
    await signer().sendOperation({ to: GATEWAY, mutezAmount: '0', entrypoint: 'call_evm', michelineArg: PARAM });
    expect(estimateCalls).toHaveLength(1);
    expect(transferCalls[0]).toMatchObject({
      // FEE_BUFFER is 1.5 over Taquito's mempool/filter-derived suggestion.
      fee:          750,
      gasLimit:     2_149,
      // The buffered path adds one storage byte.
      storageLimit: 1,
    });
  });

  it('estimates the SAME operation it submits', async () => {
    await signer().sendOperation({ to: GATEWAY, mutezAmount: '7', entrypoint: 'call_evm', michelineArg: PARAM });
    const { fee, gasLimit, storageLimit, ...submitted } = transferCalls[0];
    void fee; void gasLimit; void storageLimit;
    expect(estimateCalls[0]).toEqual(submitted);
  });
});

describe('sendOperation — operation shape', () => {
  beforeEach(() => {
    transferCalls.length = 0;
    estimateCalls.length = 0;
    transferError = null;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('targets an ARBITRARY destination, not just the NAC gateway', async () => {
    // The trap this method exists for: the ceremony hits per-role originators,
    // child KT1s and the gateway, and `sendContractCall` is hardwired to one.
    for (const to of [
      'KT1UvfhpPbdLqcqkJt6pmXQU6xPhgRseZGWG',
      'KT1JW3PHZrEo96mo76CGVWBUfmPHeDTgpVRm',
      'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb',
    ]) {
      transferCalls.length = 0;
      await signer().sendOperation({ to, mutezAmount: '0', limits: PIN });
      expect(transferCalls[0].to).toBe(to);
    }
  });

  it('omits `parameter` entirely for a plain transfer', async () => {
    // Taquito expresses "no entrypoint" by the field's absence; an empty object
    // would forge differently.
    await signer().sendOperation({ to: ACCOUNT.tz1, mutezAmount: '1000', limits: PIN });
    expect('parameter' in transferCalls[0]).toBe(false);
    expect(transferCalls[0]).toMatchObject({ amount: 1_000, mutez: true });
  });

  it('omits `parameter` when an entrypoint has no value', async () => {
    await signer().sendOperation({ to: GATEWAY, mutezAmount: '0', entrypoint: 'default', limits: PIN });
    expect('parameter' in transferCalls[0]).toBe(false);
  });

  it('sends mutez, never XTZ', async () => {
    await signer().sendOperation({ to: ACCOUNT.tz1, mutezAmount: '1', limits: PIN });
    expect(transferCalls[0]).toMatchObject({ amount: 1, mutez: true });
  });
});

describe('sendContractCall — unchanged for its existing callers', () => {
  beforeEach(() => {
    transferCalls.length = 0;
    estimateCalls.length = 0;
    transferError = null;
    estimateResult = { suggestedFeeMutez: 500, gasLimit: 2_149, storageLimit: 0 };
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('still targets the NAC gateway and still prices through the buffered path', async () => {
    // Its callers (RelayerProvider) depend on both. Generalising the signer must
    // not have moved this path.
    const hash = await signer().sendContractCall('call_evm', PARAM, '0');
    expect(hash).toBe('ooTestOpHash');
    expect(estimateCalls).toHaveLength(1);
    expect(transferCalls[0]).toMatchObject({
      to:           'KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw',
      parameter:    { entrypoint: 'call_evm', value: PARAM },
      fee:          750,
      storageLimit: 1,
    });
  });
});
