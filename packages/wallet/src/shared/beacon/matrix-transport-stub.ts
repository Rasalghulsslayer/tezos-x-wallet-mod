/**
 * A build-time stand-in for `@tezos-x/octez.connect-transport-matrix`.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 * `octez.connect-wallet`'s barrel is
 *
 *     export * from '@tezos-x/octez.connect-core'
 *     export * from '@tezos-x/octez.connect-transport-matrix'   // ← this
 *     export * from '@tezos-x/octez.connect-types'
 *     export * from '@tezos-x/octez.connect-utils'
 *     export { WalletClient, WalletClientOptions }
 *
 * and NONE of the octez.connect packages declares `sideEffects: false`. So the
 * bundler must assume every module in them can have an import side effect, the
 * star re-export cannot be shaken, and the whole Matrix P2P transport lands in
 * the content-script chunk of a wallet that never opens a Matrix connection.
 *
 * This wallet reaches Matrix through exactly nothing: it imports `WalletClient`
 * from the barrel and its own base classes from `-core` (which does not
 * reference matrix at all), and it pairs over `post_message` using the
 * hand-written `ExtensionPostMessageTransport`. The only consumer inside the SDK
 * is `WalletP2PTransport`, which this wallet never constructs and which the
 * barrel does not even re-export.
 *
 * ── WHY A THROWING CLASS AND NOT AN EMPTY OBJECT ─────────────────────────────
 * `WalletP2PTransport` is `class WalletP2PTransport extends P2PTransport`, and
 * that `extends` is evaluated when the module is EVALUATED, not when the class is
 * used. An empty stub would make it `extends undefined` and throw a TypeError at
 * import time — turning a size optimisation into a dead wallet. So `P2PTransport`
 * has to be a real class.
 *
 * It throws from its CONSTRUCTOR instead, which is the fail-loud property that
 * matters: if a future change ever does try to open a P2P transport, it dies with
 * a message naming this file, rather than silently half-working with a no-op
 * transport that accepts pairings and delivers nothing.
 */

const REASON =
  'Matrix P2P transport is stubbed out of this build (see matrix-transport-stub.ts). ' +
  'This wallet pairs over post_message only. If P2P is genuinely wanted, drop the ' +
  'resolve.alias in vite.config.ts and expect ~30 kB back in the content-script chunk.';

/** The base class `WalletP2PTransport` extends. Constructing it is the bug. */
export class P2PTransport {
  constructor() {
    throw new Error(REASON);
  }
}

/** Named exports the SDK's star re-export would otherwise surface. Same contract. */
export class P2PCommunicationClient {
  constructor() {
    throw new Error(REASON);
  }
}

export class MatrixClient {
  constructor() {
    throw new Error(REASON);
  }
}
