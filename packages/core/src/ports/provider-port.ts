/**
 * ProviderPort: EIP-1193 provider plus the wallet-side resolveSyntheticHash
 * method used to swap a synthetic NAC hash for the real kernel-synthesized
 * EVM hash. RelayerProvider (Tezos consumer) and EvmProvider (EVM consumer)
 * both satisfy this contract.
 */

import type { EIP1193Provider } from '@tezosx/relayer/types';

export interface ProviderPort extends EIP1193Provider {
  resolveSyntheticHash(syntheticHash: string): Promise<string | null>;

  /**
   * The L1 operation hash behind a synthetic NAC hash, when the provider
   * routed the transaction through the gateway. Optional: only the
   * Tezos-source RelayerProvider has an L1 leg; EvmProvider does not.
   */
  getPendingL1Hash?(syntheticHash: string): string | null;
}
