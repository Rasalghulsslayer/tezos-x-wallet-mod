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

/**
 * The kernel's fixed wei ↔ mutez exchange: 1 mutez (10^-6 XTZ, the Michelson
 * quantum) = 10^12 wei (XTZ has 18 decimals on the EVM runtime). Every value
 * crossing the runtime boundary is a whole multiple of this factor.
 */
export const WEI_PER_MUTEZ = 1_000_000_000_000n;

/**
 * Default deadline for jsonRpc round-trips. React Native's fetch has no
 * app-level timeout (a dead-but-connected network can hang unboundedly on
 * Android) and MV3 offers none either. Write passthroughs opt out — an abort
 * after a broadcast is worse than waiting.
 */
export const RPC_TIMEOUT_MS = 15_000;
export const NAC_TEZOS_RUNTIME_URL    = 'http://tezos/';    // EVM → Michelson (credit a tz1/KT1)
export const NAC_ETHEREUM_RUNTIME_URL = 'http://ethereum/'; // Michelson → EVM (credit a 0x)
