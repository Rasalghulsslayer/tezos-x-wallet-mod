/**
 * Network endpoints and NAC contract addresses used by the relayer.
 */

export const TEZLINK_EVM_RPC = 'https://evm.previewnet.tezosx.nomadic-labs.com';

export const TEZOS_L1_RPC = 'https://michelson.previewnet.tezosx.nomadic-labs.com';

export const NAC_CONTRACT = 'KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw';
export const NAC_ENTRYPOINT = 'call_evm';

export const NAC_PRECOMPILE_ADDR = '0xff00000000000000000000000000000000000007' as const;

export const NAC_RECOMMENDED_GAS = {
  call:          3_000_000n,
  callMichelson: 5_000_000n,
} as const;

/**
 * Native cross-runtime transfers go through the gateways' generic HTTP
 * `call` (EVM precompile) / `%call` (Michelson) entrypoint: a POST with an
 * empty body to the destination runtime's host, with the value attached. The
 * old hard-coded `transfer` / `%default` helpers were removed in
 * tezos/tezos!22168.
 */
export const NAC_HTTP_POST = 1; // url method enum (uint8 on EVM, nat on Michelson)
export const NAC_TEZOS_RUNTIME_URL    = 'http://tezos/';    // EVM → Michelson (credit a tz1/KT1)
export const NAC_ETHEREUM_RUNTIME_URL = 'http://ethereum/'; // Michelson → EVM (credit a 0x)
