# Test diary — migrating the wallet provider from beacon-sdk to octez.connect

**Branch:** `feat/octez-connect-provider`, cut from `feat/beacon-wallet-provider` (14 commits) ·
**Date:** 2026-08-25
**Gates:** tsc 0 across relayer + relayer/ext + core + wallet + mobile · eslint 0 errors (10
pre-existing warnings, unchanged) · vitest **760 passing across 75 files, unchanged from the beacon
branch** · `npm ci` ✓ · `npm run build:wallet` ✓ incl. the content-script Buffer gate
**Predecessors:** `../beacon-wallet-provider/README.md` (m1, connect) ·
`../beacon-operation-request/README.md` (m2, operations + the 25-op ceremony, live-verified)

**LIVE-VERIFIED, 2026-08-25: THE FULL 25-OPERATION CEREMONY RAN OVER OCTEZ.CONNECT 5.0.3 AGAINST AN
UNCHANGED 4.8 DAPP.** 25/25 applied, and the on-chain result is byte-for-byte identical to the
beacon-branch run — same fees, same limits, same parameter sizes, same total spend to the mutez. The
interop question this migration turned on is answered. See §7.

---

## 1. The finding that decides the shape of this work

**octez.connect is not a different protocol. It is beacon-sdk.** It is a fork of
`beacon-sdk v5.0.0-beta.3` republished under the `@tezos-x` namespace, maintained by Nomadic Labs,
Trilitech and Functori, implementing the same TZIP-10 wallet-interaction standard. beacon-sdk was
renamed into that namespace in **February 2026** and was sunsetting then, so the `@airgap/beacon-*`
4.8.x this wallet depended on is very likely already end-of-life.

Consequence for the design: **there is no second provider to build.** A `BEACON_REQUEST` router, a
second session protocol, a parallel approval surface — all of that would be duplicating one wire
protocol under two names. This branch is a dependency migration, and the measure of its success is
that the diff contains almost no logic.

## 2. Measured

| # | Fact | How |
|---|---|---|
| 1 | Every package this wallet used has a 1:1 replacement, all at **5.0.3**: `beacon-core` → `octez.connect-core`, `beacon-types` → `-types`, `beacon-utils` → `-utils`, `beacon-wallet` → `-wallet`. | `npm view` per package, plus the published mapping table in the migration guide. |
| 2 | **All 33 identifiers this wallet imports exist in 5.0.3.** Enumerated from source rather than assumed: 6 from core (`Client`, `MessageBasedClient`, `PeerManager`, `Serializer`, `Transport`, `getSenderId`), 21 from types, 5 from utils, `WalletClient` from wallet. | Script over every `import {…} from '@airgap/…'` in `packages/wallet/src`, then checked against the real 5.0.3 `.d.ts` files. 33/33, 0 missing. |
| 3 | The two internal base classes this wallet SUBCLASSES changed only cosmetically. `MessageBasedClient.d.ts`: import paths, plus `KeyPair` moving from `@stablelib/ed25519` to `octez.connect-utils`. `Transport.d.ts`: import paths, plus `name` widening from `protected readonly` to `readonly` — a widening, so safe for a subclass. | `diff` of the 4.8.0 and 5.0.3 `.d.ts` files. This was the migration's main risk: `ExtensionPostMessageTransport` is hand-written against these. |
| 4 | **`BEACON_VERSION` went `'3'` → `'4'`.** `SDK_VERSION` `4.8.0` → `5.0.3`. | `grep` over both dists. The one non-cosmetic difference found. |
| 5 | **v5 negotiates the envelope version DOWN, per peer**, so a v4 wallet can serve a v3 dApp: `negotiateEnvelopeVersion(peer)` returns `'2'` (flat legacy dialect) below v3, else `min(peer, BEACON_VERSION)`. Thresholds: `MESSAGE_WRAPPED_FROM_VERSION = 3`, `MULTI_NETWORK_FROM_VERSION = '4'`, `LEGACY_ENVELOPE_VERSION = '2'`. Malformed or absent versions are treated as BELOW any threshold, so a hostile peer cannot trip a higher-version path. | `octez.connect-core/dist/cjs/src/utils/message-utils.js`. |
| 6 | **That negotiation lives inside `WalletClient`, not in the transport** — `octez.connect-wallet/interceptors/OutgoingResponseInterceptor.js`. This wallet replaced the SDK's transport but kept `WalletClient`, so it inherits the negotiation for free. Had it gone the other way, this migration would have needed a hand-written version negotiator. | `grep` for callers of `negotiateEnvelopeVersion` / `wrapBeaconMessage` across all seven installed packages. |
| 7 | **v5 documents a real interop failure, and it is the MIRROR of this wallet's situation.** Legacy wallets build their pairing response from the version field of the dApp's pairing REQUEST — echoing the dApp's version instead of declaring their own — so a **v5 dApp** reading that echo sees `'4'`, serves a wrapped v4 envelope, and the **legacy wallet** silently drops it, stalling at "Pairing complete! Waiting for permission request…". v5 therefore treats `protocolVersion`, not `version`, as the capability marker. Here the roles are reversed: **v5 wallet, 4.8 dApp.** | Doc comment on `effectivePeerVersion`, same file. Recorded because it is the closest thing to evidence about §4, and it is evidence about the *other* direction. |
| 8 | **Both reasons `ExtensionPostMessageTransport` exists survive the migration**, re-verified against 5.0.3 rather than carried over. (a) `WalletPostMessageTransport` moved into `octez.connect-wallet/transports/` and still extends `PostMessageTransport`, which drives the dApp-direction `PostMessageClient`: posts `ExtensionMessageTarget.EXTENSION` (lines 56, 95), listens for `.PAGE` (lines 75, 119). (b) It still never sets `sender` — zero occurrences in the file. | `grep` over the 5.0.3 dist. So the migration removed no hand-written code; it only moved the citations that justify it. |
| 9 | `packages/core` still contains **no `@airgap` and no `@tezos-x` import** — the one `@airgap` string in `core/src/domain/beacon.ts` is prose. The hexagonal rule that kept the SDK out of the domain survived a dependency swap without needing a single edit, which is the point of it. | `grep`. |
| 10 | **760 tests pass with zero changes beyond import specifiers.** No test double, no fixture, no assertion needed adjusting for 5.0.3. | Full `npm test` across four workspaces, before and after. |
| 11 | The relayer still depends on `@airgap/beacon-sdk` ^4.8.1 and imports from it in `src/tezos/beacon.ts`, so **13 `@airgap` entries remain in the lockfile** alongside the 7 new `@tezos-x` ones. Deliberately untouched — see §5. | `grep` + lockfile inspection. |

## 3. The lockfile, and why the diff is 109 lines and not 1 200

`npm install` pruned **62 unrelated entries** — the `express` / `body-parser` optional-peer family —
while adding the 7 intended ones. The same thing happened on the beacon branch and was handled the
same way: restore the baseline lockfile, then apply only the intended delta (the 7 new `@tezos-x`
entries plus the rewritten `packages/wallet` node).

Two entries were deliberately held at baseline after inspection:

- `@stablelib/ed25519` 2.0.2 → 2.1.0, a floating re-resolution unrelated to this change;
- `@types/chrome` losing its `"dev": true` flag, which is wrong — it is a devDependency.

`npm ci` then exited 0, which is the check that matters: the lockfile installs, and the working
`node_modules` now matches it exactly rather than matching a resolution nobody asked for.

## 4. NOT DONE — the question this branch cannot answer by reading

- ~~NO LIVE RUN~~ — **closed by §7.** The ceremony ran, 25/25 applied.
- ~~THE INTEROP QUESTION IS OPEN~~ — **closed by §7.** A `BEACON_VERSION '4'` wallet paired with and
  served a `'3'` reader through 25 operations, including a 38 703-character Micheline payload. Note
  what is proven and what is merely not-contradicted: the down-negotiation WORKS for this dApp's
  version, which does not test the `'2'` flat-legacy branch of `negotiateEnvelopeVersion`, nor a
  peer that omits its version, nor a v5-to-v5 pairing at full `'4'`.
- **The probe ladder was skipped on this branch.** Rungs 1-3 were the instrument that caught the
  `(default, Unit)` measurement trap on the beacon branch; going straight to the ceremony worked, but
  a failure would have had 25 candidate causes instead of one.
- **The hand-written frame shapes are pinned to a 4.8 READER.** `page-frames.ts` cites the 4.8 dist
  on purpose, and its citations must not be "modernised" while the dApp ships 4.8 — repointing them
  at a 5.x path would cite code that is not what parses these frames.
- **The `beacon-ui` `types.length` workaround is untouched and unre-examined.** The wallet still
  announces itself twice to get past a gate that makes extension-only wallets unselectable. Whether
  `octez.connect-ui` still has that gate is unknown; it only matters once the dApp migrates.
- **`sign_payload` is still not implemented**, batches are still refused, and the
  `CALL_EVM_GAS_LIMIT` defect is still reported-not-fixed. This branch changed no behaviour.
- **Bundle size moved and is not yet attributed** — see §6.

## 5. Reported, not changed: the relayer

`packages/relayer` depends on `@airgap/beacon-sdk` ^4.8.1 and imports from it in
`src/tezos/beacon.ts`. It is a **separate, published SDK** with its own consumers, and swapping its
namespace changes what those consumers install. That is a product decision, not a side effect of
migrating the wallet, so it is left alone and named here instead.

The cost of leaving it: the monorepo now installs both SDK families, 13 `@airgap` lockfile entries
alongside 7 `@tezos-x` ones. Not a correctness problem — different packages, different dependency
trees — but it is duplication, and if beacon-sdk is EOL then the relayer inherits an unmaintained
dependency. Worth a decision, separately.

## 6. The one regression: the lazy content-script chunk grew 64%

Measured side by side, same wallet source, only the SDK differing — the beacon branch was built in a
throwaway git worktree with its own `npm ci` so the comparison is a real build and not a recalled
figure:

| | `@airgap/beacon-*` 4.8 | `@tezos-x/octez.connect-*` 5.0.3 | delta |
|---|---|---|---|
| `session-*.js` raw | 148 811 B | 244378 B | **+64%** |
| gzipped | 48.78 kB | 114.13 kB | **+134%** |

**Attributed, not guessed.** Markers in the two built chunks:

| marker | 4.8 chunk | 5.0.3 chunk |
|---|---|---|
| `MatrixClient` | present | present |
| `TezosBlockchain` | **absent** | **present** |

The matrix transport was already bundled on both branches, so it is not the cause. The new weight is
`@tezos-x/octez.connect-blockchain-tezos`, which `octez.connect-wallet` 5.0.3 lists as a dependency
and `@airgap/beacon-wallet` 4.8 did not:

    @tezos-x/octez.connect-wallet 5.0.3  ->  blockchain-tezos, core, transport-matrix,
                                             transport-postmessage, types, utils
    @airgap/beacon-wallet 4.8.1          ->  core, transport-matrix, transport-postmessage

**This wallet uses neither of them.** It registers no blockchain module and no matrix transport; it
hand-writes its own postMessage transport (Measured 8) and drives the chain through Taquito. Both are
being bundled because `WalletClient` is imported from the wallet package, which pulls its whole
dependency set past the bundler.

Scope of the cost, stated accurately: this is the **lazy** chunk, loaded only once a Beacon dApp is
detected on a page, not the eager per-page content-script cost (unchanged at 5.1 kB). So it is paid
on dApp pages, not on every page the user visits. Still, +65 kB gzipped on a content script is worth
one of: importing `WalletClient`'s pieces from `octez.connect-core` directly, a bundler-level alias
stubbing the matrix transport and blockchain module, or splitting the chunk further. **Not attempted
here** — it is an optimisation, and this branch should be judged on whether it still pairs (§4).

---

## 7. Live: the ceremony over octez.connect, and it is indistinguishable from Beacon's

Levels **593292 → 593321**, 2026-08-25T08:44:59Z → 08:46:41Z, **25 operations, 25 applied**, counter
31 → 56 — exactly 25 increments, so no reveal, no retry, nothing stray. Read from TzKT and the node
rather than from what the wallet or the dApp reported.

**The comparison that matters.** Same account, same dApp, same ceremony, only the wallet's SDK
differing:

| | beacon-sdk 4.8 run | octez.connect 5.0.3 run |
|---|---|---|
| operations / applied | 25 / 25 | 25 / 25 |
| total `bakerFee` | 3 247 173 µꜩ | **3 247 173 µꜩ** |
| balance delta | −3 272 932 µꜩ | **−3 272 932 µꜩ** |
| ops at the 660 000 gas hard limit | 6 | 6 |
| largest Micheline parameter | 38 703 chars | 38 703 chars |
| ops carrying a parameter | 25 | 25 |
| children minted, then `setAdmin`-ed | 6 → the same 6 | 6 → the same 6 |
| wall clock | 4 min 18 s | 1 min 42 s |

Every per-operation fee, gas limit and parameter size matches across the two runs. **Two differences
only**, both explained:

- **the child KT1 addresses**, because this run minted new ones;
- **op 7's `gasUsed`, 62 016 against the beacon run's 66 076.** The other 24 match exactly. This is
  the first `%call_evm` deploy, and consumption inside the gateway's EVM frame depends on the state
  it deploys into — not on which SDK serialised the request. Nothing wallet-side reaches `gasUsed`.

**What this establishes.** The migration is behaviour-preserving at the only level that counts: an
identical operation set, priced identically, spent to the mutez. Version `'4'` → `'3'`
down-negotiation works against a real 4.8 reader across a 38 kB payload. And the inter-operation
state coupling survived — phase 3 rotated admin on exactly the six children phase 1 created.

**What it does NOT establish.** The wall-clock difference (4:18 → 1:42) is recorded as an observation
with **no cause attributed**: the dApp's `paceWalletRequest` gate, operator speed, and network
conditions are all uncontrolled here, and one run each is not a measurement. Do not read it as
"octez.connect is faster". Also untested: the `'2'` flat-legacy path, a version-less peer, a v5↔v5
pairing, and every failure branch — 25/25 applied means nothing was rejected, aborted or resumed.

**Still open from the beacon branch, unchanged by this one:** §6's +64% chunk regression, the
`beacon-ui` `types.length` workaround, `sign_payload`, batches, `CALL_EVM_GAS_LIMIT`, and the fact
that no approval screen has been read back across 54 signed operations.
