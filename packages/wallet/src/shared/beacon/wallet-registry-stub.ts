/**
 * A build-time stand-in for octez.connect's bundled Tezos wallet registry.
 *
 * ── WHAT IT REPLACES ─────────────────────────────────────────────────────────
 * `octez.connect-blockchain-tezos/dist/esm/data/bundled-wallet-registry`
 * is **116 498 bytes** — a generated directory of Tezos wallets (extension,
 * desktop, web and iOS lists, with their metadata), described by its own header
 * as the *"Offline fallback for the CDN fetch in getWalletLists()"*.
 *
 * It was the single largest thing in this wallet's content-script chunk:
 *
 *     session chunk, octez.connect 5.0.3 as shipped   244.37 kB  (gzip 114.13)
 *     with the Matrix P2P transport stubbed            212.82 kB  (gzip 105.39)
 *     with this registry stubbed as well                94.32 kB  (gzip  29.43)
 *
 * ── WHY IT IS SAFE TO DROP, WHICH IS NOT THE SAME AS "IT IS UNUSED" ──────────
 * `TezosBlockchain` is genuinely on this wallet's path — `WalletClient`'s
 * constructor does `this.addBlockchain(new TezosBlockchain())` and both
 * interceptors receive the registry of blockchains — so the blockchain MODULE
 * must not be stubbed. It is only this DATA FILE that is dApp-side: it is
 * reachable from exactly one method, `getWalletLists()`, which a dApp calls to
 * populate a wallet chooser. **A wallet has no use for a directory of other
 * wallets.** Everything else in `blockchain.js` (9 kB — message wrapping,
 * `handleResponse`, the v4 wrapped path) is untouched by this stub, which is the
 * whole reason the intervention is on the data file and not on the module.
 *
 * ── WHY IT DEGRADES RATHER THAN THROWS ───────────────────────────────────────
 * The other stub in this directory (`matrix-transport-stub.ts`) throws from its
 * constructor, because constructing a P2P transport would be a bug. This one
 * must NOT throw. The registry is consumed as
 *
 *     fetchWalletListsFromGitHub('tezos').then((r) => loadWalletLists(r ?? bundled))
 *
 * so the bundle is the OFFLINE FALLBACK, not the primary source. If some future
 * code path does call `getWalletLists()`, it fetches the live registry first and
 * only reaches this value when that fetch fails — at which point an empty list is
 * a graceful degradation and an exception would be a crash. Hence a valid,
 * empty registry with the real top-level shape rather than `{}` or a thrower.
 */

/** The shape `loadWalletLists()` expects, with every list empty. */
export const bundledWalletRegistry = {
  version: '0.0.0-stubbed-by-tezosx-wallet',
  // Fixed, not generated: a build must be reproducible, and this value is never
  // shown to anyone.
  updated: '1970-01-01T00:00:00.000Z',
  extensionList: [] as unknown[],
  desktopList:   [] as unknown[],
  webList:       [] as unknown[],
  iOSList:       [] as unknown[],
};
