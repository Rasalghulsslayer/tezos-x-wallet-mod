/**
 * Tezos-consumer entry point: RelayerProvider, BeaconClient, TezlinkClient,
 * plus the use-case helpers buildTezosToEvmCall, deriveEvmAlias,
 * resolveTezosAddress.
 */

export { RelayerProvider } from './provider.js';
export { BeaconClient } from './beacon.js';
export { TezlinkClient } from './tezlink.js';
export type { EvmBlock, EvmTxSummary } from './tezlink.js';
export { buildTezosToEvmCall } from '../use-cases/build-tezos-to-evm-call.js';
export { deriveEvmAlias, resolveTezosAddress } from '../use-cases/derive-alias.js';
