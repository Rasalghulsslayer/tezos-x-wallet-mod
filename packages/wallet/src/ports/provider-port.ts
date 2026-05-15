/**
 * ProviderPort: EIP-1193 provider plus the wallet-side resolveSyntheticHash
 * method used to swap a synthetic NAC hash for the real kernel-synthesized
 * EVM hash. RelayerProvider (Tezos consumer) and EvmProvider (EVM consumer)
 * both satisfy this contract.
 */

import type { EIP1193Provider } from '@tezosx/relayer/types';

export interface ProviderPort extends EIP1193Provider {
  resolveSyntheticHash(syntheticHash: string): Promise<string | null>;
}
