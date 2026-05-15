/**
 * buildEvmToTezosCall: pure builder turning a CrossRuntimeIntent into a
 * PrecompileCall against the NAC precompile (evm-to-michelson direction).
 */

import type { CrossRuntimeIntent } from '../domain/intent.js';
import type { PrecompileCall } from '../domain/cross-runtime.js';
import { PrecompileError } from '../domain/error.js';
import { NAC_PRECOMPILE_ADDR, NAC_RECOMMENDED_GAS } from '../shared/constants.js';
import { encodeNacTransfer, encodeNacCallMichelson } from '../shared/abi.js';

const MUTEZ_TO_WEI   = 1_000_000_000_000n;
const INVALID_PARAMS = -32602;

export function buildEvmToTezosCall(intent: CrossRuntimeIntent): PrecompileCall {
  if (intent.kind === 'transfer') {
    return {
      direction: 'evm-to-michelson',
      to:        NAC_PRECOMPILE_ADDR,
      value:     intent.amount * MUTEZ_TO_WEI,
      data:      encodeNacTransfer(intent.destination),
      gasLimit:  NAC_RECOMMENDED_GAS.transfer,
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
