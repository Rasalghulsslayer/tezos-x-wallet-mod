/**
 * @tezosx/wallet-core — the platform-neutral heart of the Tezos X wallet.
 *
 * Pure domain types, the ports the use cases talk through, and the cross-layer
 * helpers (formatting, seed/identity derivation, EVM signing primitives, the
 * vault crypto envelope). No chrome.*, no DOM, no platform adapters — the
 * extension and a future mobile shell both consume this package and supply
 * their own adapters. Most consumers import the granular subpaths
 * (@tezosx/wallet-core/domain/error, /shared/format, …); this barrel re-exports
 * the two type surfaces for convenience.
 */

export * from './domain';
export * from './ports';
