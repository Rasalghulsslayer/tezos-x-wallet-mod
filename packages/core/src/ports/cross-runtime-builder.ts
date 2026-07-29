/**
 * CrossRuntimeBuilderPort: builds the EVM transaction that moves value from an
 * EVM-source account to a Tezos (tz1/KT1) destination through the NAC precompile.
 *
 * The concrete builder wraps @tezosx/relayer/evm's buildCrossRuntimeTx and binds
 * it to the platform's RPC transport — that wiring is a shell adapter
 * (adapters/evm/nac-precompile-builder). The use case (send-transfer) depends on
 * this port only, so it stays free of any transport/fetch coupling. The relayer
 * types are imported type-only, so no relayer runtime is pulled into core.
 */

import type { CrossRuntimeIntent } from '@tezosx/relayer/types';
import type { EvmCrossRuntimeTx } from '@tezosx/relayer/evm';

export interface CrossRuntimeBuilderPort {
  buildEvmToTezosTx(intent: CrossRuntimeIntent, fromAddress: `0x${string}`): Promise<EvmCrossRuntimeTx>;
}
