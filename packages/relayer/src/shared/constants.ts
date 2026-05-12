/**
 * Network endpoints and NAC contract addresses used by the relayer.
 */

export const TEZLINK_EVM_RPC = 'https://evm.previewnet.tezosx.nomadic-labs.com';

export const TEZOS_L1_RPC = 'https://michelson.previewnet.tezosx.nomadic-labs.com';

export const NAC_CONTRACT = 'KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw';
export const NAC_ENTRYPOINT = 'call_evm';

export const NAC_PRECOMPILE_ADDR = '0xff00000000000000000000000000000000000007' as const;

export const NAC_RECOMMENDED_GAS = {
  transfer:      3_000_000n,
  callMichelson: 5_000_000n,
} as const;
