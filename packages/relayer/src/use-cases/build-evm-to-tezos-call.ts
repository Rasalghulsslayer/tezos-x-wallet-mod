/**
 * buildEvmToTezosCall: pure builder turning a CrossRuntimeIntent into a
 * PrecompileCall against the NAC precompile (evm-to-michelson direction).
 */

import type { CrossRuntimeIntent } from '../domain/intent.js';
import type { PrecompileCall } from '../domain/cross-runtime.js';
import { PrecompileError } from '../domain/error.js';
import {
  NAC_PRECOMPILE_ADDR,
  NAC_RECOMMENDED_GAS,
  NAC_TEZOS_RUNTIME_URL,
  NAC_HTTP_POST,
} from '../shared/constants.js';
import { encodeNacCall, encodeNacCallMichelson } from '../shared/abi.js';

const MUTEZ_TO_WEI   = 1_000_000_000_000n;
const INVALID_PARAMS = -32602;

export function buildEvmToTezosCall(intent: CrossRuntimeIntent): PrecompileCall {
  if (intent.kind === 'transfer') {
    // A bare native transfer is a POST to http://tezos/<destination> with an
    // empty body via the generic `call` entrypoint (the removed `transfer`
    // helper's replacement — tezos/tezos!22168). The value is still mutez ×
    // 10^12 wei: the kernel converts it back wei→mutez (EL-02 fixed in !21278),
    // so this stays the exact inverse of the wei→mutez side, no inflation.
    return {
      direction: 'evm-to-michelson',
      to:        NAC_PRECOMPILE_ADDR,
      value:     intent.amount * MUTEZ_TO_WEI,
      data:      encodeNacCall(`${NAC_TEZOS_RUNTIME_URL}${intent.destination}`, [], '0x', NAC_HTTP_POST),
      gasLimit:  NAC_RECOMMENDED_GAS.call,
    };
  }
  if (intent.kind === 'call-michelson') {
    return {
      direction: 'evm-to-michelson',
      to:        NAC_PRECOMPILE_ADDR,
      value:     (intent.value ?? 0n) * MUTEZ_TO_WEI,
      data:      encodeNacCallMichelson(
        intent.destination,
        intent.entrypoint,
        intent.binaryMicheline,
      ),
      gasLimit:  NAC_RECOMMENDED_GAS.callMichelson,
    };
  }
  throw new PrecompileError(
    `Cannot build evm-to-tezos call for intent kind '${intent.kind}'`,
    INVALID_PARAMS,
  );
}
