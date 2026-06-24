import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildTezosToEvmCall,
  SubMutezPrecisionError,
  UnknownSelectorError,
} from '../build-tezos-to-evm-call';
import { NAC_CONTRACT } from '../../shared/constants';

const TO = '0xdEAD000000000000000042000000000000000000';

// The builder logs the resolved selector on the known-selector path; keep the
// test output clean without asserting on it.
afterEach(() => vi.restoreAllMocks());

describe('buildTezosToEvmCall — wei→mutez conversion & entrypoint routing', () => {
  it('bare transfer with an exact-mutez value → generic `call` entrypoint (HTTP %call), divided mutez', async () => {
    // 0x38d7ea4c68000 = 1e15 wei = exactly 1000 mutez (1e15 / 1e12).
    const call = await buildTezosToEvmCall({ to: TO, value: '0x38d7ea4c68000' });
    expect(call.direction).toBe('michelson-to-evm');
    expect(call.contractAddr).toBe(NAC_CONTRACT);
    expect(call.entrypoint).toBe('call'); // %default removed in tezos/tezos!22168
    expect(call.mutezAmount).toBe(1000n); // value conserved (wei→mutez exact)
    // %call HTTP request: POST to http://ethereum/<0x>, no headers, empty body.
    expect(call.michelineArg).toEqual({
      prim: 'Pair',
      args: [
        { string: `http://ethereum/${TO}` },
        { prim: 'Pair', args: [
          [],
          { prim: 'Pair', args: [
            { bytes: '' },
            { prim: 'Pair', args: [{ int: '1' }, { prim: 'None' }] },
          ] },
        ] },
      ],
    });
  });

  it('missing value → 0 mutez, generic `call` entrypoint', async () => {
    const call = await buildTezosToEvmCall({ to: TO });
    expect(call.mutezAmount).toBe(0n);
    expect(call.entrypoint).toBe('call');
  });

  it('rejects sub-mutez precision instead of silently flooring it away (audit H4)', async () => {
    // 1 wei has a non-zero remainder mod 1e12. A floor division would round it
    // to 0 mutez and hide the loss; the builder must throw instead.
    await expect(buildTezosToEvmCall({ to: TO, value: '0x1' }))
      .rejects.toBeInstanceOf(SubMutezPrecisionError);

    const err = await buildTezosToEvmCall({ to: TO, value: '0x1' }).catch((e) => e);
    expect(err).toBeInstanceOf(SubMutezPrecisionError);
    expect((err as SubMutezPrecisionError).weiValue).toBe(1n);
    expect((err as SubMutezPrecisionError).remainderWei).toBe(1n);
  });

  it('1 wei past a whole-mutez boundary still rejects (no rounding)', async () => {
    // 0xe8d4a51001 = 1e12 + 1 = 1 mutez + 1 wei remainder.
    await expect(buildTezosToEvmCall({ to: TO, value: '0xe8d4a51001' }))
      .rejects.toBeInstanceOf(SubMutezPrecisionError);
  });

  it('known selector → call_evm entrypoint carrying the resolved signature', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    // a9059cbb = transfer(address,uint256); abi params are opaque to the builder.
    const data = '0xa9059cbb' + '00'.repeat(64);
    const call = await buildTezosToEvmCall({ to: TO, value: '0x0', data });
    expect(call.entrypoint).toBe('call_evm');
    // The human-readable signature is embedded verbatim in the signed Micheline.
    expect(JSON.stringify(call.michelineArg)).toContain('transfer(address,uint256)');
  });

  it('unknown selector → UnknownSelectorError (allow-list gate)', async () => {
    const data = '0xdeadbeef' + '00'.repeat(32);
    await expect(buildTezosToEvmCall({ to: TO, data }))
      .rejects.toBeInstanceOf(UnknownSelectorError);

    const err = await buildTezosToEvmCall({ to: TO, data }).catch((e) => e);
    expect((err as UnknownSelectorError).selectorHex).toBe('deadbeef');
  });
});
