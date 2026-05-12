/**
 * Chain identifiers and per-runtime configuration: RuntimeId, ChainConfig.
 */

export type RuntimeId = 'michelson' | 'evm';

export interface ChainConfig {
  runtime: RuntimeId;
  chainId: string;
  rpcUrl:  string;
}
