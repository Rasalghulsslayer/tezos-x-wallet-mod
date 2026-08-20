import { describe, it, expect } from 'vitest';
import { buildEvmToTezosCall } from '../build-evm-to-tezos-call';
import { PrecompileError } from '../../domain/error';
import { NAC_PRECOMPILE_ADDR, NAC_RECOMMENDED_GAS, WEI_PER_MUTEZ } from '../../shared/constants';
import type { CrossRuntimeIntent } from '../../domain/intent';

describe('buildEvmToTezosCall — mutez→wei (×1e12) & precompile encoding', () => {
  it('transfer intent → value ×1e12, call gas, http://tezos/<dest> encoded', () => {
    const intent: CrossRuntimeIntent = { kind: 'transfer', destination: 'tz1abc', amount: 5n };
    const call = buildEvmToTezosCall(intent);
    expect(call.direction).toBe('evm-to-michelson');
    expect(call.to).toBe(NAC_PRECOMPILE_ADDR);
    expect(call.value).toBe(5n * WEI_PER_MUTEZ);          // value conserved, no inflation
    expect(call.gasLimit).toBe(NAC_RECOMMENDED_GAS.call); // generic `call`, not the removed `transfer`
    // The calldata is a NAC `call` whose url is http://tezos/<destination>.
    const urlHex = Buffer.from('http://tezos/tz1abc', 'utf8').toString('hex');
    expect(call.data.toLowerCase()).toContain(urlHex);
  });

  it('the ×1e12 factor is the exact inverse of the wei→mutez side', () => {
    // 1 mutez out must encode 1e12 wei in — the same WEI_PER_MUTEZ constant the
    // tz1→0x builder divides by. A drifted factor here is a mis-send.
    expect(buildEvmToTezosCall({ kind: 'transfer', destination: 'tz1', amount: 1n }).value)
      .toBe(WEI_PER_MUTEZ);
  });

  it('call-michelson with a value → value ×1e12, callMichelson gas', () => {
    const intent: CrossRuntimeIntent = {
      kind: 'call-michelson',
      destination: 'KT1abc',
      entrypoint: 'default',
      binaryMicheline: '0a0000000401020304',
      value: 3n,
    };
    const call = buildEvmToTezosCall(intent);
    expect(call.value).toBe(3n * WEI_PER_MUTEZ);
    expect(call.gasLimit).toBe(NAC_RECOMMENDED_GAS.callMichelson);
    expect(call.to).toBe(NAC_PRECOMPILE_ADDR);
  });

  it('call-michelson without a value defaults to 0', () => {
    const intent: CrossRuntimeIntent = {
      kind: 'call-michelson',
      destination: 'KT1abc',
      entrypoint: 'default',
      binaryMicheline: '0a0000',
    };
    expect(buildEvmToTezosCall(intent).value).toBe(0n);
  });

  it('unsupported intent kind → PrecompileError(-32602)', () => {
    // `call-evm` is a valid CrossRuntimeIntent variant but is not an evm-to-tezos
    // direction; the builder must reject it rather than silently mis-encode.
    const intent: CrossRuntimeIntent = {
      kind: 'call-evm',
      destination: '0xabc',
      methodSig: 'foo()',
      abiParamsHex: '',
    };
    expect(() => buildEvmToTezosCall(intent)).toThrow(PrecompileError);

    let code: number | undefined;
    try { buildEvmToTezosCall(intent); } catch (e) { code = (e as PrecompileError).code; }
    expect(code).toBe(-32602);
  });
});
