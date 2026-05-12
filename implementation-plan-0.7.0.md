# Implementation Plan — Wallet 0.7.0 & Relayer 0.5.0

**Author:** Antony Loussararian (Nomadic Labs)
**Status:** Awaiting team review at the phase-0 alignment meeting
**Companion document:** `./architecture-refactor-clean-architecture.md` (read first)
**Target releases:** `@tezosx/relayer` 0.4.1 → 0.5.0 (end of week 1) ; `@tezosx/wallet` 0.6.0 → 0.7.0 (end of week 3)
**Sequencing:** strictly sequential — relayer 0.5.0 ships autonomously before any
wallet refactor work begins.

---

## Context

The wallet currently supports a single account type (Tezos tz1). François has
asked us to add the symmetric direction (an EVM-native secp256k1 account that
signs EVM transactions directly and reaches Michelson via the NAC precompile)
and to make `@tezosx/relayer` cleanly consumable as a third-party SDK. The
architecture proposal in `architecture-refactor-clean-architecture.md` argues
that we ship both goals in roughly the same calendar time as the quick `if/else`
alternative, while leaving the codebase in a state where multi-account, custom
tokens, activity, and third-party SDK integrations become incremental rather
than disruptive.

This document is the execution plan for that proposal. It covers seven phases
(R1-R3 on the relayer side, then 1-4 on the wallet side) spread across three
weeks, plus a half-day phase-0 alignment meeting beforehand. Each phase has a
clear deliverable, a defined back-compat contract, a manual test plan, and a
recommended PR strategy.

The intended reader is either (a) a teammate looking at the plan ahead of the
phase-0 meeting, or (b) an executing engineer (or agent) picking up a single
phase to implement. Phases are self-contained on purpose.

---

## Sequencing in one paragraph

Week 1 is the relayer alone. R1 extracts a runtime-agnostic domain, R2 adds
`@tezosx/relayer/evm` and `@tezosx/relayer/tezos` entry points while preserving
every existing per-file legacy path as a re-export, R3 documents the SDK and
smoke-tests it against the unmodified wallet 0.6.0. Relayer 0.5.0 ships at end
of week 1. The wallet has not been touched. Week 2 begins the wallet refactor
under behavioural no-ops: phase 1 extracts the wallet's domain, phase 2
introduces ports and lifts the existing signer/provider/balance code into
adapters. Week 3 finishes: phase 3 extracts use cases, phase 4 plugs in the
symmetric EVM account and ships wallet 0.7.0 pinning `@tezosx/relayer ^0.5.0`.

Versioning lockstep: the wallet stays on relayer ^0.4.1 through all of week 1.
The wallet bumps its relayer dependency to ^0.5.0 at the start of week 2 — that
bump is a no-op for behaviour because the relayer's back-compat aliases mean
wallet 0.6.0 imports keep resolving exactly as before. The new entry points
come into use only as phases 1-4 progress.

---

## Phase 0 — Alignment

**Goal.** A 30-minute meeting with François and the team that closes the
six open questions in section 11 of the architecture doc. Output: written
decisions in this file, in the "Phase 0 decisions" section below (initially
left as `tbd`). No code changes. Must happen before any phase opens a branch.

The meeting works through the six questions in order. For each, the architecture
doc and this plan propose a default; the meeting either accepts it or overrides.
The point of the meeting is not to re-derive the answers — it is to make sure
the team owns the call before code starts being moved.

### Phase 0 alignment checklist

Each item below is a question, a proposed default, and the consequence if the
team picks the alternative.

**1. Multi-account simultaneity.** Should one vault hold a Tezos account *and*
an EVM account at the same time, or is each vault single-kind?

> *Default:* one vault holds N accounts of any mix of kinds, with an active-account
selector. Matches the MetaMask mental model. *Consequence of the alternative:*
two-vault model means the user picks "Tezos" or "EVM" at create-time and never
mixes; cleaner data model but worse UX, and the architecture doc's
`buildContainer(account, secrets)` factory naturally supports the multi-kind
model — switching to single-kind would simplify nothing meaningfully.

**2. Account ID generation.** UUID v4 (random, rename-stable) or deterministic
from the public key (no extra state)?

> *Default:* UUID v4. *Consequence of the alternative:* deterministic IDs leak
the address into storage keys, log lines, and any future URL routing. Rename
stability matters because labels can change. Random IDs cost ~16 bytes of vault
storage per account — negligible.

**3. Vault format migration.** Existing 0.6.0 users have a vault with
`{ kind: 'mnemonic' | 'edsk', value: string }`. The new format is
`{ accounts: Account[], active: string, secrets: Record<accountId, Encrypted> }`.

> *Default:* transparent upgrade-on-read in the `unlockVault` use case (phase 1
introduces the shape, phase 4 introduces the EVM secret payload). On first
unlock after upgrade, detect the legacy shape, wrap it as `accounts: [<the one
account>]` with a freshly minted UUID, persist, continue. The user sees nothing
and the upgrade is idempotent. *Consequence of the alternative:* asking users to
re-import would lose their mnemonic provenance metadata, is a UX wart, and is
unnecessary because the data is fully derivable from the existing payload.

**4. SDK boundary.** Expose two named entry points (`@tezosx/relayer/tezos`,
`@tezosx/relayer/evm`, plus shared `@tezosx/relayer/types`) or one flat module
that consumers tree-shake?

> *Default:* explicit entry points. *Consequence of the alternative:* a single
flat export communicates nothing about which subsurface is meant for which
consumer; first-time SDK users would need to read all of `index.ts` to find
their entry. Tree-shaking works either way; the named entry points are a
documentation affordance, not a bundle-size one.

**5. Relayer 1.0.0 timing.** When do we commit to a stable public API?

> *Default:* not before Tezos X mainnet ships AND the kernel internals
(gas model, alias forwarder semantics, fee constants) are frozen. We continue
shipping 0.5.x, 0.6.x, … and consumers pin via caret ranges that they bump
deliberately. *Consequence of the alternative:* committing to 1.0.0 now locks
us out of API changes we are likely to need for symmetric flows we have not yet
designed (e.g. batched cross-runtime ops).

**6. Builders vs encoders in `@tezosx/relayer/evm`.** Low-level encoders only,
or low-level encoders plus high-level builders?

> *Default:* both. Low-level (`encodeNacTransfer`, `encodeNacCallMichelson`,
`NAC_PRECOMPILE_ADDR`, `NAC_RECOMMENDED_GAS`) are honest primitives. High-level
(`buildCrossRuntimeTx`) is a convenience that encodes the 80% case (correct gas
hints, mutez↔wei conversion, sensible defaults) once for every consumer.
*Consequence of the alternative:* encoders-only forces every dApp author to
re-derive gas hints and value conversions, and that's exactly the kind of
kernel-facing knowledge the SDK exists to consolidate.

### Phase 0 decisions

| Question | Decision | Owner |
|---|---|---|
| 1. Multi-account simultaneity | _tbd at meeting_ | François |
| 2. Account ID generation | _tbd at meeting_ | François |
| 3. Vault format migration | _tbd at meeting_ | Antony |
| 4. SDK boundary | _tbd at meeting_ | François |
| 5. Relayer 1.0.0 timing | _tbd at meeting_ | François |
| 6. Builders vs encoders | _tbd at meeting_ | François |

Fill this table during the meeting. Any deviation from the defaults above means
the corresponding phase section may need revision; flag it before the phase
opens.

### Commit message (end of Phase 0)

Phase 0 produces no code; the commit edits this plan file in place with the
decisions table filled in. Branch: `docs/architecture-plan-0.7.0` (same branch
as this plan was authored on, or its successor if the plan has been merged to
`main`).

```
docs(architecture): record phase-0 alignment decisions for 0.7.0

Fills the "Phase 0 decisions" table in the implementation plan
following the alignment meeting. <One line per non-default decision,
or "All defaults accepted." if applicable.>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Phase R1 — Relayer: domain extraction

**Goal.** A runtime-agnostic domain layer exists at `packages/relayer/src/domain/`,
containing pure types and pure functions that describe cross-runtime concepts
without referencing Taquito, viem, or any transport. The existing public surface
(`RelayerProvider`, `BeaconClient`, `GatewayBuilder`, `ITezosWalletClient`,
helpers in `utils/`) keeps working unchanged — internally those files now
import their types from the new domain, but their exports are byte-for-byte
identical to what wallet 0.6.0 sees today. No new public API.

Per section 5.5 of the architecture doc, the target relayer folder structure
splits cleanly between `domain/`, `ports/`, `use-cases/`, `shared/`, `tezos/`,
`evm/`. R1 only creates `domain/` and `shared/`; the remaining folders come
with R2.

### Files touched (R1)

Create:
- `packages/relayer/src/domain/cross-runtime.ts` — `CrossRuntimeDirection`, `GatewayCall`, `PrecompileCall`, `CrossRuntimeCall` union (architecture doc §5.7).
- `packages/relayer/src/domain/intent.ts` — `CrossRuntimeIntent` union (`transfer`, `call-michelson`, `call-evm`).
- `packages/relayer/src/domain/alias.ts` — `AliasMapping` type and pure derivation helpers (currently in `utils/derive.ts`).
- `packages/relayer/src/domain/tx-status.ts` — `CrossTxStatus` state machine (architecture doc §5.7).
- `packages/relayer/src/domain/error.ts` — `RelayerError`, `GatewayError`, `PrecompileError`.
- `packages/relayer/src/domain/chain.ts` — `ChainConfig`, `RuntimeId`.
- `packages/relayer/src/domain/index.ts` — public re-exports.
- `packages/relayer/src/shared/constants.ts` — moves the existing `src/constants.ts` content here (kernel addresses, gas hints).
- `packages/relayer/src/shared/abi.ts` — minimal ABI encoder for the precompile signatures, built with `viem`'s `encodeFunctionData` (relayer already depends on viem ^2.47.2 per package.json — use it).
- `packages/relayer/src/shared/keccak.ts`, `shared/hex.ts`, `shared/async.ts`, `shared/rpc.ts` — small migrations of existing `utils/*` helpers.

Modify:
- `packages/relayer/src/provider.ts` — internally imports domain types instead of locally-declared interfaces. Public export and behaviour unchanged.
- `packages/relayer/src/gateway.ts` — likewise; uses the new domain `GatewayCall` internally.
- `packages/relayer/src/wallet-client.ts` — internally re-imports the domain error types but keeps its existing exports unchanged.
- `packages/relayer/src/constants.ts` — becomes a re-export shim: `export * from './shared/constants'`. Same path, same exported names.
- `packages/relayer/src/types.ts` — augmented to re-export from `./domain/index` so consumers gain access to the new types via the existing `./types` path. No removal.
- `packages/relayer/src/utils/derive.ts`, `utils/resolver.ts`, `utils/receipt.ts`, `utils/hex.ts`, `utils/async.ts`, `utils/rpc.ts` — each becomes a re-export shim pointing at the new home in `shared/` or `domain/`. The legacy per-file exports map continues to resolve.

Delete: nothing in R1.

Cross-reference: CLAUDE.md §16 ("Where to look first") points at `relayer/src/constants.ts` and `utils/derive.ts` — those paths must keep working after R1 because the wallet's CLAUDE.md is in active use.

### Public API surface impact (R1)

**Nothing changes externally.** Same exported symbols, same per-file paths, same
types. The `./domain/*` and `./shared/*` modules are not yet listed in the
exports map; they exist only as internal implementation. R2 is what exposes
them.

Proposed `package.json` `exports` map after R1 (unchanged from 0.4.1, modulo any
formatting):

```json
{
  ".":              "./src/index.ts",
  "./provider":     "./src/provider.ts",
  "./wallet-client":"./src/wallet-client.ts",
  "./gateway":      "./src/gateway.ts",
  "./tezlink":      "./src/tezlink.ts",
  "./constants":    "./src/constants.ts",
  "./types":        "./src/types.ts",
  "./utils/*":      "./src/utils/*.ts",
  "./package.json": "./package.json"
}
```

The `./constants` path still resolves; `./src/constants.ts` is now a one-line
re-export. Same for `./utils/*`. The `./types` path keeps resolving; the file
just re-exports more things.

### Backward compatibility (R1)

Wallet 0.6.0 must build cleanly against the in-progress R1 work at every
commit. CI for this phase is `npm run build -w @tezosx/wallet` from the repo
root with the local relayer linked via the workspace mechanism. Run that at
each commit; if it fails, the re-export shim is wrong.

No compat-shim deprecation timeline yet — R1 does not add new public surface,
so there is nothing to deprecate.

### Migration path for in-flight data (R1)

None. R1 touches only the relayer and only its internal type organisation.
No persistence, no protocol changes, no consumer-visible types.

### Test scenarios (R1)

All scenarios are no-op confirmations that wallet 0.6.0 against the in-progress
relayer behaves identically to wallet 0.6.0 against relayer 0.4.1:

1. Build the wallet (`npm run build -w @tezosx/wallet`). Load the resulting
   `packages/wallet/dist/` unpacked in Chrome. Confirm popup opens, version
   shows 0.6.0, no console errors at load.
2. Create a fresh wallet with a known mnemonic. Confirm the tz1 address
   derivation matches the previously known value for that mnemonic. (No
   regression in `utils/derive.ts` after the move.)
3. From the popup, send 1 mutez tz1 → tz1 on previewnet. Confirm the operation
   appears in TzKT under the expected opHash, and the `StatusTimeline` reaches
   `finalized` within ~30s.
4. Connect to the demo dApp at `playground/`. Send an `eth_sendTransaction`.
   Confirm the synthetic hash is returned to the dApp, the real EVM hash is
   resolved within 2 minutes, and `resolveSyntheticHash` returns the same value
   as before. (Regression check on `utils/resolver.ts` and `utils/receipt.ts`.)
5. Confirm `provider.request({ method: 'eth_chainId' })` still returns the
   correct chain ID. (Regression on `tezlink.ts` and constants.)

If any test fails, the corresponding re-export is misaligned. Stop and fix
before opening the next PR.

### Estimated effort (R1)

1.5 – 2 working days. The work is mechanical (move files, add re-export shims,
adjust internal imports) but the regression surface is the entire wallet 0.6.0,
so the time budget is dominated by manual smoke-testing after each PR.

### Dependencies (R1)

Phase 0 decisions in hand. Nothing else.

### PR strategy (R1)

Two PRs, ~400-500 lines each:

- **PR R1a — Extract `domain/` and `shared/`, internalise types in provider/gateway.**
  Title: `feat(relayer): extract domain layer (R1a)`.
  Description: introduces `src/domain/` and `src/shared/`, moves pure types and
  helpers into them, internal imports updated. No public API change. Wallet
  0.6.0 builds and runs unchanged.

- **PR R1b — Re-export shims for legacy paths.**
  Title: `chore(relayer): re-export legacy paths from new homes (R1b)`.
  Description: `src/constants.ts`, `src/utils/*.ts`, `src/types.ts` become
  one-line re-export shims. Same exports map, same symbols. Wallet 0.6.0
  imports keep resolving. CHANGELOG entry added under `Changed`.

### Risks specific to R1

- *Risk:* a type that was inlined in `provider.ts` is subtly different from its
  new domain home (e.g. an optional field flipped to required). The wallet
  builds against the relayer types via `@tezosx/relayer/types`, and a stricter
  type would manifest as a typecheck failure on the wallet only.
  *Mitigation:* run `npm run typecheck -w @tezosx/wallet` at every commit, not
  just `build`. If a type tightens, widen it back to match the wallet's usage.

- *Risk:* the moved `utils/derive.ts` returns a slightly different alias for
  some edge-case tz1 (e.g. tz1 starting with leading zeros after base58 decode).
  *Mitigation:* test scenario 2 above. If it fires, the move is non-pure and
  needs to be backed out.

### Commit message (end of Phase R1)

Branch: `feat/relayer-r1`. Merged to `main` once both R1a and R1b PRs are
green. The phase wrap-up commit message (the merge commit of R1b, or a squashed
single commit if the team prefers squash-merging short PRs):

```
refactor(relayer): extract runtime-agnostic domain layer (R1)

Internal reorganisation: src/domain/ and src/shared/ hold pure types
and helpers previously inlined in provider.ts, gateway.ts,
constants.ts, and utils/. Per-file legacy paths (./provider,
./wallet-client, ./gateway, ./tezlink, ./constants, ./utils/*) now
resolve via one-line re-export shims. Public API, behaviour, and
the exports map are unchanged. Wallet 0.6.0 builds unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Phase R2 — Relayer: EVM entry point with back-compat aliases

**Goal.** `@tezosx/relayer/evm`, `@tezosx/relayer/tezos`, and `@tezosx/relayer/types`
are real importable entry points exposing the SDK surface described in §5.6
of the architecture doc. The legacy per-file paths (`./provider`, `./wallet-client`,
`./gateway`, `./tezlink`, `./constants`, `./types`, `./utils/*`) continue to
work as re-exports and remain documented as the supported path for 0.5.x.

This is the load-bearing wall: wallet 0.6.0 builds against the in-progress R2
relayer through the legacy aliases at every commit. The wallet team does not
move to the new paths until weeks 2-3.

### Files touched (R2)

Create:
- `packages/relayer/src/ports/tezos-wallet-client.ts` — same `ITezosWalletClient` interface, now in `ports/`. Re-exported from the legacy `./wallet-client` path.
- `packages/relayer/src/ports/evm-wallet-client.ts` — new `IEvmWalletClient` interface (optional consumer interface for EVM-side wallets that want a fuller integration than just helpers).
- `packages/relayer/src/ports/transport.ts` — `TransportPort` covering Tezos L1 RPC + Tezlink EVM RPC abstraction.
- `packages/relayer/src/ports/index.ts`.
- `packages/relayer/src/use-cases/build-tezos-to-evm-call.ts` — extracted from `gateway.ts`, takes intent → `GatewayCall`. Pure function.
- `packages/relayer/src/use-cases/build-evm-to-tezos-call.ts` — new, takes intent → `PrecompileCall` (architecture doc §5.8).
- `packages/relayer/src/use-cases/resolve-synthetic-hash.ts` — extracted from `utils/resolver.ts`.
- `packages/relayer/src/use-cases/build-synthetic-receipt.ts` — extracted from `utils/receipt.ts`.
- `packages/relayer/src/use-cases/track-cross-runtime-status.ts` — async iterator status tracker for both directions.
- `packages/relayer/src/use-cases/derive-alias.ts` — relocated from `utils/derive.ts` body.
- `packages/relayer/src/use-cases/index.ts`.
- `packages/relayer/src/tezos/provider.ts` — relocated `RelayerProvider`. Public class shape unchanged.
- `packages/relayer/src/tezos/beacon.ts` — relocated `BeaconClient`.
- `packages/relayer/src/tezos/tezlink.ts` — relocated `TezlinkClient`.
- `packages/relayer/src/tezos/index.ts` — public re-exports for `@tezosx/relayer/tezos`.
- `packages/relayer/src/evm/encoders.ts` — `encodeNacTransfer`, `encodeNacCallMichelson` using viem's `encodeFunctionData`.
- `packages/relayer/src/evm/builders.ts` — `buildCrossRuntimeTx` (architecture doc §5.6 example).
- `packages/relayer/src/evm/status-tracker.ts` — `trackCrossRuntimeStatus` async iterable for the EVM-to-Michelson direction.
- `packages/relayer/src/evm/index.ts` — public re-exports.

Modify:
- `packages/relayer/package.json` — exports map gains `./tezos`, `./evm`, and points `./types` at the new domain hub. Legacy paths retained as re-export shims (see proposed map below).
- `packages/relayer/src/provider.ts` — becomes a one-line re-export from `./tezos/provider`. Marked `@deprecated` in JSDoc pointing readers at `@tezosx/relayer/tezos`.
- `packages/relayer/src/gateway.ts` — re-exports a thin facade that wraps `buildTezosToEvmCall`. Same exported `GatewayBuilder` class signature.
- `packages/relayer/src/wallet-client.ts` — re-exports from `./ports/tezos-wallet-client`.
- `packages/relayer/src/tezlink.ts` — re-exports from `./tezos/tezlink`.
- `packages/relayer/src/constants.ts` — re-exports from `./shared/constants` (already a shim after R1).
- `packages/relayer/src/types.ts` — re-exports from `./domain/index` and `./ports/index`.
- `packages/relayer/src/index.ts` — keeps re-exporting the legacy default surface (no change to "what `@tezosx/relayer` exports without a subpath").

Delete: nothing yet. Legacy files become shims, not removals. Deletion is
scheduled for relayer 0.6.0.

### Public API surface impact (R2)

**Additive only.** Three new subpaths gain meaning:

- `@tezosx/relayer/tezos` — `RelayerProvider`, `BeaconClient`, `TezlinkClient`, `GatewayBuilder` (re-exported facade), `ITezosWalletClient`.
- `@tezosx/relayer/evm` — `encodeNacTransfer`, `encodeNacCallMichelson`, `buildCrossRuntimeTx`, `trackCrossRuntimeStatus`, `NAC_PRECOMPILE_ADDR`, `NAC_RECOMMENDED_GAS`, `IEvmWalletClient`.
- `@tezosx/relayer/types` — all domain types and port interfaces, suitable for consumer-side type annotations without pulling in any runtime code.

All legacy paths still resolve and return the same symbols they did in 0.4.1.

Proposed `package.json` `exports` map after R2:

```json
{
  ".":               "./src/index.ts",

  "./tezos":         "./src/tezos/index.ts",
  "./evm":           "./src/evm/index.ts",
  "./types":         "./src/types.ts",

  "./provider":      "./src/provider.ts",
  "./wallet-client": "./src/wallet-client.ts",
  "./gateway":       "./src/gateway.ts",
  "./tezlink":       "./src/tezlink.ts",
  "./constants":     "./src/constants.ts",
  "./utils/*":       "./src/utils/*.ts",

  "./package.json":  "./package.json"
}
```

Note `./types` keeps pointing at `./src/types.ts`, which now re-exports
`./domain/index` and `./ports/index` in addition to whatever was historically
there. Consumers who imported a type from `@tezosx/relayer/types` in 0.4.1 still
find it under that path. Consumers importing the new domain types should prefer
`@tezosx/relayer/types` going forward; the file-level paths under `./utils/*`
are explicitly legacy.

### Backward compatibility (R2)

The hard rule: at every commit on R2's branch, `npm run build -w @tezosx/wallet`
must succeed against the in-place relayer source.

Compat-shim deprecation timeline:

| Path | Status in 0.5.0 | Removal target |
|---|---|---|
| `@tezosx/relayer/provider` | re-export shim, `@deprecated` JSDoc | 0.6.0 |
| `@tezosx/relayer/wallet-client` | re-export shim, `@deprecated` JSDoc | 0.6.0 |
| `@tezosx/relayer/gateway` | re-export facade, `@deprecated` JSDoc | 0.6.0 |
| `@tezosx/relayer/tezlink` | re-export shim, `@deprecated` JSDoc | 0.6.0 |
| `@tezosx/relayer/constants` | re-export shim, `@deprecated` JSDoc | 0.6.0 |
| `@tezosx/relayer/utils/*` | re-export shims, `@deprecated` JSDoc | 0.6.0 |

The `@deprecated` JSDoc tags are advisory in 0.5.0; consumers get an IDE hint
but the path still resolves. Removal is a 0.6.0 minor bump and gets called out
in the 0.6.0 CHANGELOG migration notes.

`@tezosx/relayer/types` is **not** deprecated — it remains the supported way to
import types from the SDK.

### Migration path for in-flight data (R2)

None. The relayer carries no persistent state. Its consumers (the wallet)
do, but their persistence is not touched by R2.

### Test scenarios (R2)

Same five scenarios as R1, with two additions exercising the new entry points
through a temporary scratch script (not shipped):

6. From a Node REPL with the relayer locally linked, `import { encodeNacTransfer }
   from '@tezosx/relayer/evm'`. Encode a transfer to a known tz1. Compare the
   output bytes to a fixture produced by `octez-client` for the same input. Must
   match exactly.
7. From the same REPL, `import { buildCrossRuntimeTx } from '@tezosx/relayer/evm'`
   and produce a complete EVM tx for a 1-mutez transfer to a tz1. Verify `to`
   equals `NAC_PRECOMPILE_ADDR`, `value` equals 1e12 wei, `gasLimit` equals
   `NAC_RECOMMENDED_GAS.transfer`, `data` matches the encoded calldata from
   scenario 6.

### Estimated effort (R2)

2 working days.

### Dependencies (R2)

R1 merged.

### PR strategy (R2)

Three PRs, each ~500 lines:

- **PR R2a — Move existing Tezos-consumer code into `src/tezos/` and `src/ports/`.**
  Title: `feat(relayer): extract tezos entry point (R2a)`.
  All paths to `RelayerProvider`, `BeaconClient`, `TezlinkClient`, and
  `ITezosWalletClient` keep resolving via shims. New `./tezos` and `./types`
  exports added to the map. No new behaviour.

- **PR R2b — Add `src/evm/` entry point with encoders and builders.**
  Title: `feat(relayer): add EVM entry point and cross-runtime builders (R2b)`.
  New `./evm` export. `buildCrossRuntimeTx`, `encodeNacTransfer`,
  `encodeNacCallMichelson`. Includes scratch-script test scenarios 6 and 7.

- **PR R2c — Extract use cases; refactor `GatewayBuilder` into a facade over
  `buildTezosToEvmCall`.**
  Title: `refactor(relayer): use-cases as pure functions (R2c)`.
  No public API change. The internal cleanup that lets R3 document the SDK
  without referencing the old class-based plumbing.

### Risks specific to R2

- *Risk:* the exports map is order-sensitive in some Node resolvers; placing
  `./utils/*` after `./types` could mask the `./types` literal match.
  *Mitigation:* keep the literal paths first in the map, then wildcard last.
  Test by running `node -e 'console.log(require.resolve("@tezosx/relayer/types"))'`
  in a workspace REPL after each PR.

- *Risk:* viem's `encodeFunctionData` produces a different calldata layout than
  hand-rolled keccak + ABI encoding would, and existing wallet flows that already
  use `GatewayBuilder` see a calldata diff.
  *Mitigation:* PR R2c writes a one-shot snapshot test against the existing
  `GatewayBuilder` output for a representative tx. Any diff fails the PR.

- *Risk:* a third-party consumer who imports `import { foo } from '@tezosx/relayer'`
  (the bare entry) relies on a symbol that we'd planned to expose only under
  `./tezos`. *Mitigation:* keep the bare entry's exports a superset of 0.4.1's.
  Nothing is removed from the bare `.` path in 0.5.0. The bare path is
  effectively "Tezos consumer mode with everything" for back-compat.

### Commit message (end of Phase R2)

Branch: `feat/relayer-r2`. Wrap-up commit (merge of R2c, or final squash):

```
feat(relayer): EVM consumer entry point and use-case extraction (R2)

@tezosx/relayer/evm exposes the encoders (encodeNacTransfer,
encodeNacCallMichelson), the high-level builder buildCrossRuntimeTx,
the cross-runtime status tracker, and the NAC precompile constants.
@tezosx/relayer/tezos groups the existing Tezos-consumer surface as
a named entry point. @tezosx/relayer/types is the typed hub.

Legacy per-file paths (./provider, ./wallet-client, ./gateway,
./tezlink, ./constants, ./utils/*) keep working as re-export shims,
marked @deprecated and scheduled for removal in 0.6.0. Wallet 0.6.0
builds unchanged against the new exports map.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Phase R3 — Relayer: SDK documentation and smoke test → ship 0.5.0

**Goal.** Public-facing SDK docs exist for both consumer modes. Wallet 0.6.0
has been verified to build and run end-to-end against the now-final 0.5.0
relayer source. CHANGELOG entry is written. Tag and publish 0.5.0.

### Files touched (R3)

Create:
- `packages/relayer/README.md` — overhauled. Top-level intro to "what is `@tezosx/relayer`", followed by two sections (Tezos consumer mode and EVM consumer mode) with the worked examples from architecture doc §5.6.
- `packages/relayer/docs/tezos-consumer.md` — long-form guide for tz1-based wallets integrating the relayer's `RelayerProvider`.
- `packages/relayer/docs/evm-consumer.md` — long-form guide for 0x-based wallets and EVM dApps using the precompile encoders and `buildCrossRuntimeTx`.
- `packages/relayer/docs/migration-from-0.4.x.md` — short note. The current per-file paths still work; new code should prefer `@tezosx/relayer/tezos` / `@tezosx/relayer/evm`. Removal scheduled for 0.6.0.

Modify:
- `packages/relayer/package.json` — bump version to `0.5.0`.
- `packages/relayer/CHANGELOG.md` — add a `## [0.5.0] — 2026-MM-DD` entry. Sections:
  - `Added`: `@tezosx/relayer/evm` entry point with encoders, builders, and cross-runtime status tracker. `@tezosx/relayer/tezos` named entry point. `@tezosx/relayer/types` typed hub. `IEvmWalletClient` interface.
  - `Changed`: internal reorganisation to `domain/`, `ports/`, `use-cases/`, `shared/`, `tezos/`, `evm/`. Existing per-file paths now resolve via re-exports.
  - `Compatibility`: wallet 0.6.0 builds against 0.5.0 unchanged. Third-party
    consumers using per-file paths continue to work. Per-file paths are
    `@deprecated` in 0.5.0, scheduled for removal in 0.6.0.

Delete: nothing.

### Public API surface impact (R3)

None beyond R2. R3 is documentation, version bump, and release.

### Backward compatibility (R3)

Verified by re-running the full R1 test scenarios 1-5 against the bumped 0.5.0
build of the relayer, with wallet 0.6.0 imports unchanged. If a regression
surfaces, treat it as a blocker on the 0.5.0 tag; do not paper over it with a
follow-up patch.

### Migration path for in-flight data (R3)

None.

### Test scenarios (R3)

1. Full wallet 0.6.0 smoke test against published 0.5.0:
   - Fresh install, create wallet, derive expected tz1.
   - Send 1 mutez tz1 → tz1, reach `finalized`.
   - Connect to playground dApp, `eth_sendTransaction`, real EVM hash resolved.
   - Lock and unlock the wallet.
2. From a clean working copy of the wallet at 0.6.0, change only the version pin
   in `packages/wallet/package.json` to `"@tezosx/relayer": "^0.5.0"`, run
   `npm install`, then `npm run build`. Result must be byte-similar to the
   `^0.4.1` build (modulo deterministic timestamps). Confirm the dist `manifest.json`
   still passes the postbuild checks per CLAUDE.md §12.

### Estimated effort (R3)

1 working day.

### Dependencies (R3)

R2 merged.

### PR strategy (R3)

One PR: `release(relayer): 0.5.0 — SDK entry points and docs`. Body links the
two consumer guides, lists what's added, restates the deprecation timeline.
Merging triggers the tag and the registry publish (if/when we're publishing —
currently both packages are `"private": true` in their package.json, so this
is a workspace-internal "release" until François decides we go public).

### Risks specific to R3

- *Risk:* the README rewrite drifts from what the code actually does, and a
  third-party reading the SDK guide writes broken integration code.
  *Mitigation:* every code block in the README and the two guides must be
  copy-pasted from a working scratch script. Add the scratch scripts to
  `packages/relayer/examples/` (gitignored from publish but tracked) so the
  next person editing the docs can re-run them.

- *Risk:* the deprecation JSDoc on legacy paths breaks third-party tooling that
  treats `@deprecated` as a hard error (some CI lints).
  *Mitigation:* word the JSDoc as `@deprecated since 0.5.0 — moved to
  '@tezosx/relayer/tezos'. The path will be removed in 0.6.0.` Most lints
  treat this as a warning, not an error. If a known consumer (Temple?) blocks
  on this, soften to a `@see` instead and accept the silent drift.

### Commit message (end of Phase R3 — relayer 0.5.0 release)

Branch: `feat/relayer-r3` (same `feat/relayer-r*` naming as R1 and R2; this
phase happens to include the version bump and tag). Tag created off the merge
commit on `main`: `relayer-v0.5.0`.

```
release(relayer): 0.5.0 — SDK entry points and docs

Bumps @tezosx/relayer to 0.5.0. Adds packages/relayer/README.md with
worked examples for both consumer modes, plus docs/tezos-consumer.md
and docs/evm-consumer.md long-form guides. Wallet 0.6.0 verified to
build unchanged against this release through the back-compat aliases.

Changelog: ./CHANGELOG.md (Added, Changed, Compatibility sections).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Phase 1 — Wallet: domain extraction

**Goal.** A `packages/wallet/src/domain/` folder exists, holding pure types
and functions that the wallet's business logic depends on. The existing `lib/`,
`background/`, and `ui/` code keeps working unchanged — its imports for those
types now resolve to `domain/`, but the public messaging and UI behaviour are
byte-for-byte identical to 0.6.0.

The architecture doc §6 enumerates the target shape of `domain/`. Phase 1
populates it with what's already there in `lib/`; new types for EVM accounts
are not added until phase 4.

### Files touched (Phase 1)

Create:
- `packages/wallet/src/domain/account.ts` — `Account` discriminated union with `TezosAccount` only in this phase. Includes `AccountKind`, `AccountId`. The `EvmAccount` variant is added in phase 4.
- `packages/wallet/src/domain/transfer.ts` — `TransferRequest`, `TransferRoute`, `decideRoute` (architecture doc §7.1). Phase 1 ships `decideRoute` returning only the two routes valid for a Tezos signer (`native` and `nac-gateway-l1`); the EVM-source branches are stubbed with `throw new UnsupportedRouteError(...)` and filled in phase 4.
- `packages/wallet/src/domain/tx-status.ts` — `TxStatus` state machine lifted from `lib/tx-status.ts`. The fetcher/poller stays in `lib/tx-status.ts` as an orchestrator; only the types and state-transition rules move.
- `packages/wallet/src/domain/approval.ts` — `Approval`, `Connection`, `Transaction`, `Signature` (the `Signature` variant is new in this phase as an empty placeholder; filled in phase 4).
- `packages/wallet/src/domain/asset.ts` — `Asset`, `AssetBalance`, `AssetId`. Phase 1 ships XTZ and USDC entries; custom tokens come in phase 7.
- `packages/wallet/src/domain/chain.ts` — `ChainConfig`, `RuntimeId`.
- `packages/wallet/src/domain/error.ts` — `FormattedError`, `KNOWN_ERRORS`, `formatError` lifted from `lib/errors.ts` (or `lib/tezos-errors.ts` depending on its current name per CLAUDE.md §16).
- `packages/wallet/src/domain/validation.ts` — `validateMnemonic`, `validateAddress`, `validateAmount` lifted from `lib/address.ts` and `lib/seed.ts`.
- `packages/wallet/src/domain/index.ts` — public re-exports.

Modify:
- `packages/wallet/src/lib/errors.ts` — becomes a one-line re-export from `domain/error.ts`.
- `packages/wallet/src/lib/address.ts` — keeps the runtime-detection helper and re-exports validators from `domain/validation.ts`.
- `packages/wallet/src/lib/tx-status.ts` — keeps the poller orchestration, imports the types from `domain/tx-status.ts`.
- `packages/wallet/src/lib/messages.ts` — message types that reference the moved types (`Account`, `FormattedError`) import them from `domain/`.
- `packages/wallet/package.json` — bump the relayer dependency pin to `"@tezosx/relayer": "^0.5.0"`. This is a no-op for behaviour (the wallet's existing imports keep resolving via the relayer's legacy aliases). It is what week-2 builds against.

Delete: nothing in phase 1.

Cross-reference: CLAUDE.md §16 ("Where are the error parsers?") points at
`lib/errors.ts` or `lib/tezos-errors.ts`. After phase 1, the answer is "the
parsers live in `domain/error.ts`; `lib/errors.ts` is a thin re-export until
phase 4 cleans it up." Update CLAUDE.md as part of the phase 4 CHANGELOG / docs
pass, not phase 1 — too early to commit the new structure to the documented
"where to look" table.

### Public API surface impact (Phase 1)

The wallet exposes no public API. Internal-only refactor.

### Backward compatibility (Phase 1)

Wallet popup behaviour, dApp integration, vault format, message types — all
identical to 0.6.0. The wallet still pins `@tezosx/relayer: ^0.5.0` after the
bump and gets the same runtime behaviour from the relayer through its legacy
aliases.

### Migration path for in-flight data (Phase 1)

None. Vault shape unchanged, session shape unchanged. Phase 1 only moves types;
no persistence touched.

### Test scenarios (Phase 1)

All five from the R1 test scenarios, re-run against wallet HEAD after each PR.
No new flows added.

Additionally:
6. From `chrome://extensions`, click "Errors" on the wallet entry after running
   it for ten minutes across the five scenarios. Expect zero new errors.
   Type tightenings in `domain/` that aren't reflected in `lib/` callers
   surface as runtime undefined-access errors — they're rare but cheap to catch
   this way.

### Estimated effort (Phase 1)

2.5 – 3 working days.

### Dependencies (Phase 1)

Phase R3 merged. Relayer 0.5.0 is on the registry (or workspace) and the wallet
pin is bumped on the first commit of phase 1.

### PR strategy (Phase 1)

Two PRs:

- **PR W1a — Create `domain/`, move pure types from `lib/`, leave shims.**
  Title: `feat(wallet): extract domain layer (W1a)`.
  ~500 lines. The bulk of the file moves and the new index.

- **PR W1b — Adjust internal imports across `background/`, `ui/`, `injected/`
  to consume from `domain/` directly where possible.**
  Title: `refactor(wallet): consume domain types directly (W1b)`.
  ~300-400 lines. Once this lands, `lib/errors.ts` and `lib/address.ts` are
  thin shims that exist purely for back-compat with any test/script that still
  imports them. Removal is scheduled for phase 4.

### Risks specific to Phase 1

- *Risk:* `formatError` has subtle behaviour around message-regex matching
  (per CLAUDE.md §8) and the move changes how some imports resolve, breaking a
  regex that depends on a specific call-order side effect.
  *Mitigation:* the test scenarios deliberately include the wrong-password
  flow (Unlock with bad password → `ErrorInline`) and the insufficient-balance
  flow (Send too much → `ErrorCard`). Both exercise `formatError` end-to-end.

- *Risk:* `decideRoute` returns a `TransferRoute` that the existing `Send.tsx`
  doesn't yet consume — `Send.tsx` still has its old implicit routing logic.
  This is fine in phase 1 because the function is unused, but if someone wires
  it up early it could mask a routing bug.
  *Mitigation:* phase 1 explicitly does not wire `decideRoute` into `Send.tsx`.
  That wiring is phase 3. Comment on the function noting it is not yet on the
  hot path.

### Commit message (end of Phase 1)

Branch: `feat/wallet-w1`. Wrap-up commit (merge of W1b, or final squash):

```
refactor(wallet): extract domain layer (W1)

Pure types and functions move out of lib/ into a new domain/:
Account, TransferRequest, TransferRoute, decideRoute, TxStatus,
Approval, Asset, FormattedError, KNOWN_ERRORS, validators. The
existing lib/ modules become orchestrators that depend on domain/;
lib/errors.ts and lib/address.ts are thin re-export shims pending
removal in phase 4. Bumps the @tezosx/relayer pin to ^0.5.0 (no-op
behaviour through the relayer's back-compat aliases). Behaviour and
the popup ↔ SW message protocol are unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Phase 2 — Wallet: port introduction and adapter lift

**Goal.** Interfaces describing what use cases need from the outside world
exist under `packages/wallet/src/ports/`. Existing Chrome / Taquito / TzKT
code is lifted from `lib/` and `background/` into `packages/wallet/src/adapters/`,
each adapter implementing one port. A `composition/container.ts` factory wires
the Tezos-only branch. The service worker uses the container. Behaviour is
unchanged.

The architecture doc §4.3 enumerates the eight ports. Phase 2 ships all of
them as interfaces; phase 4 adds the EVM variants of `SignerPort` and
`ProviderPort`.

### Files touched (Phase 2)

Create:
- `packages/wallet/src/ports/signer-port.ts` — `SignerPort` discriminated union with `TezosSignerPort` populated. `EvmSignerPort` is declared as a placeholder type with `kind: 'evm'` and the method signatures from architecture doc §4.3, but no implementation references it yet.
- `packages/wallet/src/ports/provider-port.ts` — `ProviderPort`.
- `packages/wallet/src/ports/vault-store.ts`, `session-store.ts`, `balance-fetcher.ts`, `activity-fetcher.ts`, `notification-port.ts`, `clock.ts`.
- `packages/wallet/src/ports/index.ts`.
- `packages/wallet/src/adapters/tezos/tezos-signer.ts` — `LocalSignerClient` from `background/signer.ts`, renamed and refactored to implement `TezosSignerPort`.
- `packages/wallet/src/adapters/tezos/tezos-provider.ts` — extracts the wallet-side `RelayerProvider` wiring from `service-worker.ts`. Internally still uses `@tezosx/relayer/tezos` (the new entry point).
- `packages/wallet/src/adapters/tezos/tezos-balance-fetcher.ts` — TzKT + Tezlink RPC reads lifted from `lib/balances.ts`.
- `packages/wallet/src/adapters/chrome/chrome-vault-store.ts` — vault encryption + chrome.storage.local persistence lifted from `background/keyring.ts`.
- `packages/wallet/src/adapters/chrome/chrome-session-store.ts` — per-origin dApp session persistence lifted from `background/approval-queue.ts` and related.
- `packages/wallet/src/adapters/chrome/chrome-notification.ts` — toolbar badge and approval-window-open helpers lifted from `lib/badge.ts` and `background/approval-queue.ts`.
- `packages/wallet/src/composition/container.ts` — `buildContainer(account, secrets)` factory. Phase 2 implements only the `account.kind === 'tezos'` branch (architecture doc §7.4).
- `packages/wallet/src/composition/sw-wiring.ts` — placeholder that re-exports the existing SW message handlers. Filled in phase 3.
- `packages/wallet/src/composition/constants.ts` — network-level constants (`TZKT_API_BASE`, `TEZLINK_EVM_RPC`, `BLOCKSCOUT_API_BASE`, `NAC_GATEWAY_KT1`). Moved out of `lib/constants.ts`. Wallet-app-level constants (explorer URLs, USDC contract, faucet URL) stay in `lib/constants.ts` per CLAUDE.md §14.

Modify:
- `packages/wallet/src/background/signer.ts` — becomes a one-line re-export from `adapters/tezos/tezos-signer`.
- `packages/wallet/src/background/keyring.ts` — keeps the high-level Keyring class but delegates persistence to `ChromeVaultStore`. The `UnlockedIdentity` type stays the same shape for now; phase 4 generalises it to `UnlockedSession`.
- `packages/wallet/src/background/service-worker.ts` — at the top of the message handler, instantiates the container via `buildContainer(...)` when a session is unlocked. Use case dispatch still happens via the inline switch (phase 3 changes that).
- `packages/wallet/src/lib/balances.ts` — becomes a re-export shim from `adapters/tezos/tezos-balance-fetcher`. Slated for deletion in phase 4 or phase 5.
- `packages/wallet/src/lib/badge.ts` — re-export shim from `adapters/chrome/chrome-notification`. Slated for deletion in phase 4 or 5.

Delete: nothing in phase 2.

### Public API surface impact (Phase 2)

None. Internal-only.

### Backward compatibility (Phase 2)

Unchanged. The service worker's incoming message router still handles every
existing message type with the same return shape. The vault format on disk is
the legacy `{ kind: 'mnemonic' | 'edsk', value: string }` — phase 4 introduces
the new shape with a transparent upgrade-on-read.

### Migration path for in-flight data (Phase 2)

None. Persistence layout is byte-identical to 0.6.0. `ChromeVaultStore` reads
and writes the same `chrome.storage.local` keys with the same JSON shapes.

### Test scenarios (Phase 2)

All five base scenarios from R1, plus:

7. From a 0.6.0-installed wallet (vault present in chrome.storage.local), upgrade
   in place to the phase-2 build (replace `dist/` and reload). Confirm unlock
   succeeds with the original password, the tz1 derived is unchanged, and the
   prior dApp connections in `Connections` are still listed. (Confirms the
   `ChromeVaultStore` and `ChromeSessionStore` storage-key parity.)
8. Force a balance fetch failure (briefly take TzKT offline by editing
   `composition/constants.ts` to point at an invalid URL, rebuild). Confirm
   `Toast` shows the network-error variant. Restore. (Confirms the
   `TezosBalanceFetcher` error path still flows through `formatError`.)

### Estimated effort (Phase 2)

2 working days.

### Dependencies (Phase 2)

Phase 1 merged.

### PR strategy (Phase 2)

Three PRs:

- **PR W2a — Ports as interfaces + Chrome adapters.**
  Title: `feat(wallet): ports and chrome adapters (W2a)`.
  ~450 lines. `ports/` populated, `chrome-vault-store`, `chrome-session-store`,
  `chrome-notification`. Existing `background/keyring.ts`, `lib/badge.ts`
  delegate to them.

- **PR W2b — Tezos adapters.**
  Title: `feat(wallet): tezos adapters (W2b)`.
  ~500 lines. `tezos-signer`, `tezos-provider`, `tezos-balance-fetcher`. The
  in-place `background/signer.ts` and `lib/balances.ts` become re-export shims.

- **PR W2c — Composition root and SW wiring scaffolding.**
  Title: `feat(wallet): composition root (W2c)`.
  ~300 lines. `composition/container.ts`, `composition/constants.ts`,
  `composition/sw-wiring.ts` (placeholder). The SW instantiates the container.
  Existing message dispatch left untouched.

### Risks specific to Phase 2

- *Risk:* `ChromeVaultStore` mis-handles the salt/iv encoding when reading
  legacy 0.6.0 vaults, producing decrypt failures for users with existing
  installs.
  *Mitigation:* test scenario 7 above is the explicit check. Run it before
  merging W2a.

- *Risk:* `TezosProvider` (the wallet's adapter wrapping the relayer's
  `RelayerProvider`) holds the relayer instance across SW reboots and
  re-instantiation, leading to ghost event listeners after multiple lock/unlock
  cycles.
  *Mitigation:* `container.ts` produces a fresh `TezosProvider` for each
  unlock. `buildContainer` is invoked per message dispatch (re-build is cheap;
  it does not re-instantiate Taquito).

- *Risk:* Moving constants to `composition/constants.ts` collides with
  CLAUDE.md §14 which directs readers to `lib/constants.ts` for wallet-level
  constants. *Mitigation:* keep wallet-app constants (explorer URLs, USDC,
  faucet) in `lib/constants.ts`. Only network-and-protocol constants (RPC
  endpoints, contract addresses) move to `composition/`. Update CLAUDE.md §14
  in phase 4 to reflect the split, not now.

### Commit message (end of Phase 2)

Branch: `feat/wallet-w2`. Wrap-up commit (merge of W2c, or final squash):

```
refactor(wallet): introduce ports and lift Tezos/Chrome adapters (W2)

ports/ holds interfaces describing what use cases need from the
outside world (SignerPort, ProviderPort, VaultStore, SessionStore,
BalanceFetcher, ActivityFetcher, NotificationPort, Clock).
adapters/tezos/ implements the Tezos-side ports on Taquito and the
@tezosx/relayer/tezos provider. adapters/chrome/ wraps chrome.storage,
chrome.windows, chrome.action. composition/container.ts is the
single-place factory that wires concrete adapters to a session.
The service worker instantiates the container per-message. Behaviour,
vault format, and message protocols unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Phase 3 — Wallet: use case extraction

**Goal.** Each meaningful SW message handler is a pure function in
`packages/wallet/src/use-cases/<verb>.ts` taking `(req, deps: Deps)` and
returning a `Result`. The SW becomes a routing table from message type to use
case invocation. Use cases are unit-testable in isolation with mock ports.
Behaviour is unchanged.

The architecture doc §4.2 lists eleven use cases. Phase 3 ships ten of them
(the EVM-only variants of `signMessage` for typed data come in phase 4). The
`refreshBalances` and `listActivity` use cases are stubbed for the Tezos side
only; EVM balance/activity adapters come in phase 4.

### Files touched (Phase 3)

Create:
- `packages/wallet/src/use-cases/create-account.ts`
- `packages/wallet/src/use-cases/import-account.ts`
- `packages/wallet/src/use-cases/unlock-vault.ts`
- `packages/wallet/src/use-cases/lock-vault.ts`
- `packages/wallet/src/use-cases/list-accounts.ts`
- `packages/wallet/src/use-cases/set-active-account.ts`
- `packages/wallet/src/use-cases/send-transfer.ts` — architecture doc §7.2 verbatim, minus the EVM branches which throw `UnsupportedRouteError` in phase 3 and get filled in phase 4.
- `packages/wallet/src/use-cases/connect-dapp.ts`
- `packages/wallet/src/use-cases/sign-message.ts` — Tezos-side `personal_sign` only in phase 3.
- `packages/wallet/src/use-cases/refresh-balances.ts`
- `packages/wallet/src/use-cases/list-activity.ts`
- `packages/wallet/src/use-cases/index.ts`
- `packages/wallet/vitest.config.ts` — test runner setup (see test infrastructure section below).
- `packages/wallet/src/use-cases/__tests__/send-transfer.test.ts` — first test against mock ports. Covers the two existing Tezos routes (`native` and `nac-gateway-l1`).
- `packages/wallet/src/domain/__tests__/decide-route.test.ts` — exhaustive table test over the (sourceKind × destAddressFormat) matrix.

Modify:
- `packages/wallet/src/composition/sw-wiring.ts` — real implementation. A routing table from `Message['type']` to a use case function. Each entry returns the use case's result; the SW callback wraps it for the chrome.runtime.sendMessage protocol.
- `packages/wallet/src/background/service-worker.ts` — message handler becomes the ~30-line shape from architecture doc §7.5. All inline switch logic is gone; everything routes through `sw-wiring`.
- `packages/wallet/src/background/approval-queue.ts` — keeps the queue state but invokes use cases through `sw-wiring` for the resolve / reject transitions.
- `packages/wallet/package.json` — add `vitest` to `devDependencies` (and the `test` script).
- `packages/wallet/CHANGELOG.md` — accumulating entries for 0.7.0; phase 3 contributes the `Changed` line about the SW being thinned out and `Added` line about the Vitest setup.

Delete:
- Inline message-handler functions in `background/service-worker.ts` that have moved to use cases.

### Public API surface impact (Phase 3)

None. The popup ↔ SW message protocol is preserved, including error shapes.

### Backward compatibility (Phase 3)

The popup is the wallet's "consumer" of the SW; popup builds against the same
typed message contracts in `lib/messages.ts` and gets identical responses.
dApp ↔ SW protocol unchanged.

### Migration path for in-flight data (Phase 3)

None. Vault and session shapes unchanged. Persistence keys identical.

### Test scenarios (Phase 3)

Five base scenarios from R1, plus the new Vitest suite:

9. `npm run test -w @tezosx/wallet` from the repo root passes all suites:
   - `decide-route` exhaustive table (≥6 cases).
   - `send-transfer` against a mock `SignerPort` returning canned hashes for
     the two Tezos-source routes.
   - At least one `unlock-vault` test with the legacy vault shape (foreshadows
     the phase-4 migration).
10. Manual: every existing popup flow (Welcome → Create → Unlock → Home →
    Send → Receive → Activity → Connections → Settings) still works. This is
    the regression net for the SW handler extraction.

### Estimated effort (Phase 3)

3 working days. The use-case extraction is mostly mechanical, but the Vitest
setup, the first few tests, and the SW wiring revision add roughly half a day
of overhead.

### Dependencies (Phase 3)

Phase 2 merged.

### PR strategy (Phase 3)

Four PRs:

- **PR W3a — Vitest setup + first tests (`decide-route`, `format-error`).**
  Title: `chore(wallet): add Vitest, test domain functions (W3a)`.
  ~300 lines. No production code change beyond pulling in the dev dependency
  and adding the `test` script.

- **PR W3b — Auth use cases (`unlock-vault`, `lock-vault`, `create-account`,
  `import-account`, `list-accounts`, `set-active-account`).**
  Title: `feat(wallet): extract auth use cases (W3b)`.
  ~500 lines including their tests.

- **PR W3c — Transfer use cases (`send-transfer`, `refresh-balances`,
  `list-activity`).**
  Title: `feat(wallet): extract transfer use cases (W3c)`.
  ~500 lines including tests. Includes the `decide-route` integration in
  `send-transfer`.

- **PR W3d — dApp use cases (`connect-dapp`, `sign-message`).**
  Title: `feat(wallet): extract dApp use cases (W3d)`.
  ~400 lines including tests. After this lands, the SW message handler is the
  thin shape from architecture doc §7.5.

### Risks specific to Phase 3

- *Risk:* an extracted use case loses the implicit ordering guarantee provided
  by the SW's inline switch (e.g. the vault must be loaded before any other
  operation can read it). *Mitigation:* the `Deps` parameter is constructed by
  `buildContainer` only when a session is unlocked; use cases that require an
  unlocked session take a non-null `container` in their `Deps` and the SW
  rejects messages that arrive while locked with the existing `4100 wallet
  locked` EIP-1193 error (per CLAUDE.md §4).

- *Risk:* Vitest is configured to run in jsdom and pulls in Buffer / crypto
  polyfills that mask real chrome-environment issues.
  *Mitigation:* configure Vitest for `node` test environment, not jsdom. Use
  cases are pure and don't need DOM. Adapter tests are not in scope for
  phase 3.

- *Risk:* the existing manual approval flow in `Approve.tsx` breaks because
  `approval-queue.ts` now routes through `sw-wiring` rather than calling its
  inline handlers. *Mitigation:* PR W3d adds a manual test scenario walking
  through a full dApp connect → tx-approve cycle, run before merge.

### Commit message (end of Phase 3)

Branch: `feat/wallet-w3`. Wrap-up commit (merge of W3d, or final squash):

```
refactor(wallet): extract use cases; add Vitest for domain + use-cases (W3)

SW message handlers reorganised as pure (req, deps) functions in
use-cases/ (create-account, import-account, unlock-vault, lock-vault,
list-accounts, set-active-account, send-transfer, connect-dapp,
sign-message, refresh-balances, list-activity).
composition/sw-wiring.ts is the routing table; the service worker
becomes a ~30-line entry. Adds Vitest configured for the node
environment, covering decideRoute (table-driven), formatError, and
sendTransfer against mock ports. EVM-source routes still throw
UnsupportedRouteError — they get filled in phase 4. Behaviour
unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Phase 4 — Wallet: EVM adapter consuming `@tezosx/relayer/evm` → ship 0.7.0

**Goal.** A second account kind exists end-to-end. The user can create or
import an EVM-native account, see its address on Home, send to a tz1 (cross-runtime
via the NAC precompile, using `buildCrossRuntimeTx` from
`@tezosx/relayer/evm`), send to another 0x (same-runtime native EVM), receive
the correct asset routing, and the dApp `eth_sendTransaction` path uses the
wallet's own EVM signing instead of the Tezos-relayer wrap. Wallet 0.7.0 ships
at the end of this phase, pinning `@tezosx/relayer ^0.5.0`.

### Files touched (Phase 4)

Create:
- `packages/wallet/src/domain/account.ts` — extend `Account` discriminated union with `EvmAccount` (architecture doc §4.1). Account `id` is a UUID v4 (phase-0 decision 2's default).
- `packages/wallet/src/lib/evm-signing/` — local EVM signing helpers built on `@noble/curves/secp256k1`, `@scure/bip32`. Functions: `signTransaction1559`, `signPersonalMessage`, `signTypedDataV4`. **No `viem`, no `ethers`** in the wallet — see "What not to do" in CLAUDE.md §15. RLP encoding hand-rolled in a small `rlp.ts` here. Keccak via `@noble/hashes/sha3`.
- `packages/wallet/src/adapters/evm/evm-signer.ts` — implements `EvmSignerPort` using the helpers above. Class shape from architecture doc §7.3.
- `packages/wallet/src/adapters/evm/evm-provider.ts` — direct JSON-RPC client for the Tezlink EVM RPC, implementing `ProviderPort` for the EVM-kind container. Includes nonce caching, gas estimation, raw-tx broadcasting.
- `packages/wallet/src/adapters/evm/evm-balance-fetcher.ts` — Tezlink for native XTZ balance via `eth_getBalance`, blockscout for ERC-20 reads via the standard JSON-RPC `eth_call` to the token contract.
- `packages/wallet/src/adapters/evm/evm-activity-fetcher.ts` — blockscout API for historical EVM tx list. Stubbed for phase 4 to return empty if blockscout is unavailable; richer activity comes in phase 7.
- `packages/wallet/src/adapters/evm/nac-precompile-builder.ts` — thin wrapper around `@tezosx/relayer/evm`'s `buildCrossRuntimeTx`. Exists so the use case talks to a port-shaped thing, not to the relayer directly.
- `packages/wallet/src/ui/pages/Approve.tsx` updates — adds the `Signature` approval variant for `personal_sign` / `signTypedData`.
- `packages/wallet/src/ui/pages/Welcome.tsx` updates — adds a **binary** kind selector (Tezos or EVM, exactly one). Multi-account simultaneity is explicitly out of scope for 0.7.0; the data model supports `accounts: Account[]` but the create/import flow in 0.7.0 only ever produces a single account per vault. The "two-accounts-at-once at onboarding" UX is part of the 0.8.0 multi-account work (see "Beyond 0.7.0" below).
- `packages/wallet/src/ui/pages/Create.tsx`, `Import.tsx` updates — accept and surface the account kind, including the new mnemonic-vs-EVM-privkey import path for EVM accounts.
- `packages/wallet/src/ui/view-models/account-card-vm.ts` — phase 5 is when view models get formalised across the board, but `AccountCardVM` is added now so the AccountCard can render both kinds without a fork. Architecture doc §7.6 verbatim.
- `packages/wallet/src/ui/tx/StatusTimeline.tsx` updates — picks up the new `evm-to-michelson` direction variant of `CrossTxStatus` from `@tezosx/relayer/types`.

Modify:
- `packages/wallet/src/composition/container.ts` — branch on `account.kind`. The `evm` branch instantiates the EVM adapters. Wires `nac-precompile-builder` for the cross-runtime path. Architecture doc §7.4 verbatim.
- `packages/wallet/src/use-cases/send-transfer.ts` — the two EVM branches (`evm + native` and `evm + nac-precompile-l2`) are filled in. Architecture doc §7.2 verbatim.
- `packages/wallet/src/use-cases/create-account.ts`, `import-account.ts` — dispatch on `req.kind` to either Tezos derivation (existing) or EVM derivation (new, via the helpers in `lib/evm-signing/`).
- `packages/wallet/src/use-cases/unlock-vault.ts` — gains the upgrade-on-read path: if the loaded payload matches the legacy `{ kind, value }` shape, wrap as `{ accounts: [<one TezosAccount>], active: <new uuid>, secrets: { <uuid>: <encrypted-original-payload> } }` and save back atomically before returning.
- `packages/wallet/src/use-cases/sign-message.ts` — the EVM-side branches are filled in for `personal_sign` and `signTypedData`.
- `packages/wallet/src/background/keyring.ts` — `UnlockedIdentity` becomes `UnlockedSession` carrying the active `Account` and a `secrets` lookup keyed by account id.
- `packages/wallet/src/lib/messages.ts` — message types extended for the EVM account kind. Each new message type is a new branch in the SW router; phase-3's exhaustive matcher catches missed branches at typecheck time.
- `packages/wallet/src/lib/balances.ts`, `lib/badge.ts` — delete the re-export shims left from phase 2. Imports get pointed directly at adapter / port locations. (This is the deferred cleanup from phase 2.)
- `packages/wallet/src/ui/pages/Home.tsx`, `Send.tsx`, `Receive.tsx`, `Approve.tsx`, `Activity.tsx`, `Connections.tsx` — adjust to read from `Account` (the union) and from `AccountCardVM`. The pages stop reading `state.tz1` directly; they read `state.activeAccount` and let the VM differentiate.
- `packages/wallet/package.json` — bump version to `0.7.0`. Confirm `"@tezosx/relayer": "^0.5.0"`.
- `packages/wallet/manifest.json` — bump version to `0.7.0` (per CLAUDE.md §11, these must match).
- `packages/wallet/CHANGELOG.md` — write the `## [0.7.0] — 2026-MM-DD` entry.
  - `Added`: EVM account kind end-to-end (create, import, send, receive, approve). UUID-based account IDs. `personal_sign` and `signTypedData` for EVM accounts.
  - `Changed`: vault format upgraded to multi-account-ready shape; transparent upgrade-on-read for existing 0.6.0 vaults. Internal architecture moved to ports/adapters/use-cases (no user-visible effect).
  - `Compatibility`: existing 0.6.0 vaults open unchanged. New accounts can be added to existing vaults.
- `CLAUDE.md` (the project-root one) — refresh §3 ("Architecture") and §16 ("Where to look first") to reference the new layer locations. This is the only phase that edits CLAUDE.md.

Delete:
- The phase-2 re-export shims in `lib/balances.ts` and `lib/badge.ts`. Their callers move to direct imports.
- Inline routing logic in `Send.tsx` that's been replaced by `decideRoute` + the EVM-aware `sendTransfer`.

### Public API surface impact (Phase 4)

The wallet exposes no public API; the wallet's "API" is the SW message
protocol consumed by the popup. New message types are added for EVM account
creation, import, and the EVM signing variants. The dApp-facing
`window.ethereum` surface is **unchanged** — same EIP-1193 methods, same
responses; under the hood the implementation forks based on the active
account.

### Backward compatibility (Phase 4)

- 0.6.0 vaults open without user intervention. The upgrade-on-read in
  `unlockVault` is idempotent and atomic.
- 0.6.0 dApp connections persist across the upgrade.
- The Tezos send flow, the dApp `eth_sendTransaction` flow, and every error
  message are byte-identical to 0.6.0 for users with only a Tezos account.

### Migration path for in-flight data (Phase 4)

The vault upgrade path runs in `unlockVault`:

1. Load the raw payload from chrome.storage.local (key unchanged).
2. If the payload's top-level shape is the legacy `{ kind, value }`, derive a
   `TezosAccount` from it (the existing derivation already exists in `lib/seed.ts`
   / `domain/validation.ts`), generate a UUID, wrap in the new shape, encrypt
   the original mnemonic / edsk into the `secrets[uuid]` slot, write the new
   payload back to the same storage key.
3. Otherwise, decrypt under the new shape.

**Session store upgrade — done eagerly at vault upgrade time, not lazily.**
0.6.0 dApp sessions carry a `tz1Address` field that disappears in the 0.7.0
schema in favour of `accountId`. If the session upgrade were lazy (rewritten
the first time each session is read), a user with N active dApp connections
would see N progressive rewrites with potentially inconsistent intermediate
states — e.g. one dApp's session points at the new `accountId` while another
still carries the legacy `tz1Address`, and the badge counter reads from a mix.
The upgrade is therefore performed in the same `unlockVault` flow, immediately
after the vault payload is rewritten: all sessions are loaded, each gets its
`tz1Address` replaced by the freshly-minted `accountId` pointing at the migrated
account, and the session store is written back atomically. Test scenario 17
exercises this with three pre-existing dApp connections to confirm none are
orphaned and all three resolve to the same account post-upgrade.

Phase 4 must include test scenarios 16 (vault upgrade from a real 0.6.0
install, including the re-lock / re-unlock idempotency cycle) and 17
(multi-session migration consistency).

### Test scenarios (Phase 4)

All five from R1, plus:

11. **Cross-runtime EVM → tz1 transfer.** Create a fresh EVM account in a new
    wallet. Fund it by sending from a Tezos account at the faucet via the
    cross-runtime path (or by directly transferring from an existing 0x).
    Send 1 mutez-equivalent to a known tz1. Confirm the EVM hash is broadcast,
    the Michelson effect appears on TzKT for the tz1's incoming credit, and
    the `StatusTimeline` reaches `finalized` within ~2 minutes.
12. **Same-runtime EVM → EVM transfer.** From the same EVM account, send 1 mutez
    to another 0x. Confirm hash returned, included, finalized in normal EVM
    timing.
13. **Cross-runtime tz1 → 0x transfer.** Regression. Same as before, must
    behave identically to 0.6.0.
14. **dApp `eth_sendTransaction` with EVM account active.** Connect to the
    playground dApp with the EVM account. Send. Confirm the wallet signs and
    broadcasts the EVM tx directly (no NAC gateway involved), and the dApp
    receives the real EVM hash immediately (no synthetic-hash resolution
    needed).
15. **dApp `personal_sign` with EVM account active.** Same dApp signs a personal
    message. Confirm signature verifies against the EVM address using viem's
    `recoverMessageAddress` (run in the dApp page, not the wallet).
16. **Vault upgrade from 0.6.0 (single-account).** Starting from a real 0.6.0
    install, upgrade in place to the phase-4 build, unlock. Confirm the
    derived tz1 is unchanged, the new vault shape is on disk, and the active
    account points at the migrated UUID. Lock, unlock again — the second
    unlock must not re-mint a new UUID (re-running the legacy detection path
    on an already-upgraded vault is a regression). Send 1 mutez tz1 → tz1 to
    confirm the migrated account is functional. *(The "add a second account
    of the other kind" follow-up is explicitly out of scope for 0.7.0 — there
    is no "add account" UI in 0.7.0; the multi-account switcher is 0.8.0 work.
    The vault format is forward-compatible with multiple accounts, but the
    create/import flow only fires at first-onboarding and produces exactly
    one account.)*
17. **Multi-session dApp migration consistency.** Starting from a real 0.6.0
    install with three dApp sessions connected (e.g. playground + two other
    test dApps), upgrade in place. Immediately after unlock — before any other
    user interaction — trigger `eth_sendTransaction` from each of the three
    dApps in quick succession. All three must resolve correctly under the new
    `accountId`. No "session not found" error, no badge inconsistency, no
    intermediate state where one dApp sees the new shape and another the legacy
    `tz1Address`. This is the regression check for the eager session-store
    upgrade path.
18. **`eth_signTypedData_v4`.** Less critical for previewnet but cheap to
    verify; the dApp signs a EIP-712 typed payload, the signature recovers to
    the expected EVM address.

### Estimated effort (Phase 4)

3 working days. The EVM signing helpers (`signTransaction1559`, RLP, keccak,
`signPersonalMessage`, `signTypedDataV4`) are the chunk where most subtle bugs
live; budget 1 full day for them and their unit tests against a fixture set
generated by viem at test time (viem is allowed in the relayer's test runner,
not in the wallet's production code).

### Dependencies (Phase 4)

Phase 3 merged. Relayer 0.5.0 is pinned and verified.

### PR strategy (Phase 4)

Five PRs. PR W4b is split from the original plan into W4b (routing logic) and
W4b-bis (vault and session migration) on review feedback: the migration touches
existing-user persistence and has the highest regression surface in phase 4,
so it deserves to be isolable and revertable independently from the EVM
routing work.

- **PR W4a — EVM signing helpers + adapter implementations.**
  Title: `feat(wallet): EVM signing primitives and adapters (W4a)`.
  ~600 lines. Crucial unit tests against known-good signatures (use viem in
  the test-runner only). The four adapters: `evm-signer`, `evm-provider`,
  `evm-balance-fetcher`, `evm-activity-fetcher`, plus `nac-precompile-builder`
  wrapping `@tezosx/relayer/evm`.

- **PR W4b — Domain extension + use-case EVM branches (no persistence change).**
  Title: `feat(wallet): EVM domain and use cases (W4b)`.
  ~400 lines. `EvmAccount` variant on the domain `Account` union, `decideRoute`
  EVM branches, `sendTransfer` four-way routing, `signMessage` EVM variants,
  `createAccount` / `importAccount` EVM derivation. Unit tests for the new
  routing branches. **No change to `unlockVault` or any persistence path —
  this PR is behaviourally additive only for users who don't yet have an EVM
  account.** Existing 0.6.0 vaults continue to load via the legacy path
  untouched.

- **PR W4b-bis — Vault and session migration to multi-account shape.**
  Title: `feat(wallet): multi-account-ready vault + session migration (W4b-bis)`.
  ~350 lines. Introduces the `{ accounts, active, secrets }` vault shape,
  the eager session-store migration, and the upgrade-on-read in `unlockVault`.
  Dedicated tests: scenario 16 (single-account vault upgrade with re-lock
  idempotency) and scenario 17 (multi-session dApp migration consistency).
  This PR is the highest-regression-surface change in phase 4 and is sized to
  be revertable on its own without touching W4b's routing work.

- **PR W4c — UI: binary kind selector, account card VM, send/approve flows.**
  Title: `feat(wallet): EVM account UI (W4c)`.
  ~500 lines. Welcome update for the **binary** kind selection (Tezos or EVM,
  exactly one). Create / Import update to surface the chosen kind. `AccountCardVM`
  added. Approve gains the `Signature` variant. Status timeline reads the new
  direction. Explicitly does **not** ship a multi-account switcher — that is
  0.8.0 work.

- **PR W4d — 0.7.0 release: version bumps, CHANGELOG, CLAUDE.md refresh.**
  Title: `release(wallet): 0.7.0 — symmetric EVM accounts (W4d)`.
  ~200 lines. Version bumps in `package.json` and `manifest.json`. CHANGELOG
  entry covering the cumulative 0.7.0 work. CLAUDE.md §3 and §16 updated to
  reflect the new layered architecture. Last test pass through scenarios 11-18.

### Risks specific to Phase 4

- *Risk:* the EVM signing helpers produce signatures that pass viem's recovery
  on previewnet but disagree with what the Tezlink EVM runtime expects (e.g.
  chain-id-aware EIP-155 byte ordering).
  *Mitigation:* PR W4a includes round-trip tests against viem-generated
  expected outputs. PR W4a is also where we run scenario 14 against the real
  Tezlink RPC before merging — no shortcut here, the kernel acceptance is the
  source of truth.

- *Risk:* the vault-upgrade-on-read is not fully atomic across browser-close
  boundaries. The write of the new payload at the existing storage key is
  atomic for that key (single `chrome.storage.local.set`, no deletion step
  needed since the old payload is overwritten in one operation). But the
  upgrade involves a decrypt of the legacy payload followed by re-encrypt
  under the new shape with a freshly-minted UUID v4. If the browser is closed
  between the successful decrypt and the successful `set`, the next unlock
  re-runs the legacy detection path and mints a *different* UUID — accounts
  prior to the first successful upgrade have no external referents in 0.7.0
  (no third-party data pinned to an account UUID), so this is observably
  benign for end users. But:
  - It does mean "atomicity" is in the same-UUID-space only after the first
    successful write. Two upgrade attempts that each crash mid-flow can leave
    two different UUIDs in the vault history (only the latest survives, but
    if anything had referenced the first attempt's UUID — e.g. a session
    that got partially upgraded by a fast lazy path — it would be orphaned).
  - The eager session-store upgrade in the same `unlockVault` flow (see
    Migration path) mitigates the orphan case because sessions are rewritten
    in the same `set` round-trip as the vault payload.
  *Mitigation:* document the limitation. For 0.7.0 it is acceptable because
  accounts have no external referents (no per-account analytics, no per-account
  cloud sync, nothing pinned externally). Flagged as a deterministic-ID
  requirement for the 0.8.0 multi-account work — if 0.8.0 adds per-account
  cloud backup or per-account external linking, UUIDs become real referents
  and the ID generation strategy needs to become deterministic-from-pubkey or
  the upgrade needs to become a two-phase write (revisit Phase 0 decision 2
  at that point).

- *Risk:* the cross-runtime status tracker reads from blockscout for the EVM
  side and TzKT for the Michelson effect, and the two are out of sync (TzKT
  catches up first; blockscout is briefly stale). The timeline appears stuck
  even though both sides finished.
  *Mitigation:* tolerate the lag in the timeline rendering — show "finalized
  on L2, awaiting L1 confirmation" as a distinct visual state, not as
  "stuck". The state already exists in the `CrossTxStatus` domain
  (`included-target` vs `finalized`); make sure the UI renders both.

- *Risk:* a 0.6.0 user with an active dApp connection is sent to an account-
  selection-required state on first unlock after upgrade. *Mitigation:* the
  upgrade sets `active` to the single migrated account's UUID. The first-
  unlock UX is indistinguishable from 0.6.0.

### Commit message (end of Phase 4 — wallet 0.7.0 release)

Branch: `feat/wallet-w4` (same `feat/wallet-w*` naming as the earlier wallet
phases). Tag created off the merge commit on `main`: `wallet-v0.7.0`.

```
release(wallet): 0.7.0 — symmetric EVM accounts

Adds the EVM-native account end-to-end: create / import with a binary
kind selection (Tezos or EVM, exactly one), EVM-native
eth_sendTransaction, personal_sign, signTypedData_v4, and cross-runtime
EVM → tz1 via the NAC precompile (consumed from @tezosx/relayer/evm).
Cross-runtime tz1 → 0x continues to work unchanged.

Vault format upgrades transparently from 0.6.0 to a multi-account-
ready { accounts, active, secrets } shape; existing users see no
prompt. Session store is migrated eagerly in the same unlockVault
flow to avoid intermediate inconsistent states. Multi-account UI
(switcher, add-account, per-account labels at scale) is deferred to
0.8.0; the data model is forward-compatible.

Pins @tezosx/relayer ^0.5.0. manifest.json version matches
package.json. CLAUDE.md §3 and §16 refreshed to describe the new
layered architecture.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Cross-cutting deliverables

### Branching strategy

Each phase merges into `main` once its PRs are green. Phases are
short-lived branches off `main` named `feat/relayer-r1`, `feat/relayer-r2`,
`feat/relayer-r3`, `feat/wallet-w1`, … and so on. PRs within a phase are
branches off the phase branch, each rebased onto the parent before merge.

At every commit on `main` throughout weeks 1-3, `npm run build` from the repo
root must succeed for both workspaces, and `npm run typecheck` must pass. This
is the explicit promise of the back-compat aliases. The first commit that
breaks this promise gets reverted before the day ends.

The wallet 0.6.0 build stays green throughout weeks 1-3 because:

- Through week 1, the wallet's relayer pin is `^0.4.1`. Relayer 0.5.0 has not
  shipped yet; the wallet builds against 0.4.1 unchanged.
- At the start of week 2, the relayer pin bumps to `^0.5.0` (a no-op for
  behaviour because the legacy paths the wallet 0.6.0 uses still resolve via
  re-export shims).
- Weeks 2 and 3 progress the wallet from 0.6.0 to 0.7.0 in-place. Every
  intermediate commit builds because phases 1-3 are behavioural no-ops and
  phase 4 only adds the EVM surface (the Tezos surface remains identical).

The trade-off: short-lived branches mean reviewers must engage promptly (~24h
turnaround on PR review), and the team must be willing to merge mechanical
refactors quickly. The alternative — a long-lived `clean-arch` integration
branch — accumulates merge debt against `main` over three weeks and inverts
the visibility of the work. Short branches into `main` win for this project
size.

### Versioning lockstep

| Week | Relayer | Wallet | Wallet's relayer pin |
|---|---|---|---|
| Start of week 1 | 0.4.1 | 0.6.0 | `^0.4.1` |
| End of week 1 | **0.5.0 (shipped)** | 0.6.0 | `^0.4.1` |
| Start of week 2 | 0.5.0 | 0.6.0 | **bumped to `^0.5.0`** (no-op behaviour) |
| End of week 2 | 0.5.0 | 0.6.0 (still — phases 1-2 land as patches in-place but no user-visible change merits 0.6.1) | `^0.5.0` |
| End of week 3 | 0.5.0 | **0.7.0 (shipped)** | `^0.5.0` |

If a regression is found in relayer 0.5.0 during weeks 2 or 3: **hold and
patch to 0.5.1**, do not roll back. Rolling back the relayer once wallet
phases 1-3 have started consuming new entry points means rewinding the wallet
work too; the back-compat aliases mean rolling back is not even necessary —
any 0.5.0 bug is fixable in 0.5.1 with the same exports map. The wallet
re-pins to `^0.5.0` (already a caret range) and picks up the patch on next
install.

The exception: if the regression is in the new `@tezosx/relayer/evm` surface
specifically and is structural rather than a bug (e.g. an encoder produces the
wrong calldata in a way that requires a signature change), then patch to
0.5.1 with the new shape and accept that any consumer who started building
against 0.5.0 needs to re-adjust. Communicate this in the CHANGELOG migration
section. This is the worst case; budget two extra days of wallet-side
adjustment if it happens.

### CHANGELOG strategy

Both packages keep their own `CHANGELOG.md` in Keep-a-Changelog format per
CLAUDE.md §11.

**Relayer.** A single `## [0.5.0] — 2026-MM-DD` entry, written and committed
as part of PR R3's release commit. Sections used: `Added`, `Changed`,
`Compatibility`. The cumulative work of R1, R2, R3 is described in prose, not
phase-by-phase.

**Wallet.** Entries accumulate across phases 1-4 in a single `## [0.7.0] — 2026-MM-DD`
block that grows as PRs land. Each phase's PR contributes one or more lines
under the appropriate Keep-a-Changelog heading. Final cleanup happens in PR W4d:

- Phase 1 contributes `Changed` lines about the internal domain extraction and
  `Added` if `formatError` gains any caught error families during the move.
- Phase 2 contributes `Changed` lines about the adapter layer and `Security`
  if `ChromeVaultStore` happens to tighten anything (likely not).
- Phase 3 contributes `Changed` for the SW thinning and `Added` for the Vitest
  setup.
- Phase 4 contributes the bulk: `Added` for the EVM account end-to-end, `Changed`
  for the vault format upgrade-on-read, `Compatibility` for the 0.6.0
  preservation note.

The wallet does not cut a 0.6.1 or 0.6.x patch during weeks 2-3 unless an
unrelated production bug demands it. All phase-1-through-4 work rolls into
0.7.0.

### Test infrastructure investment (Vitest setup)

**Recommendation: yes, set up Vitest as part of phase 3, scoped to domain and
use cases only.**

Reasons. The architecture doc §10 specifically calls out the regression
control problem: as the (account kind × asset × destination × route) matrix
grows, manual scripts in CHANGELOG entries become untenable. The cheapest
investment that mitigates that is a unit-test runner exercising the pure
functions where the combinatorics live: `decideRoute`, `formatError`,
`sendTransfer` (with mock ports), `createAccount`. The adapter implementations
and the UI remain manual-tested for 0.7.0 — adapter integration tests need a
running RPC and are a separate investment, and UI tests need Playwright /
Puppeteer and are out of scope for 0.7.0.

Setup details. Vitest config in `packages/wallet/vitest.config.ts`. Test
environment: `node`, not jsdom. Test scripts: `npm run test -w @tezosx/wallet`.
Tests live next to the code under test in `__tests__/` subfolders. Phase 3
ships ~10 tests covering `decideRoute` (table-driven), `formatError` (one
test per family), and `sendTransfer` (the two Tezos routes). Phase 4 adds
tests for the EVM `sendTransfer` routes, the vault upgrade-on-read, and the
EVM signing helpers (round-trip against viem-generated expected outputs, viem
allowed in test runner only).

CI integration: there is no CI suite today in this repo (`.github/` exists
but is sparse; verify). Phase 3 does not block on CI integration — that is a
follow-up. The `test` script being runnable locally is sufficient.

### Slack rollout plan (draft messages)

Two messages for `#techrel-tezosx-mvp`, matching the factual tone of prior
wallet updates.

**Message 1 — posted after the phase-0 alignment meeting, start of week 1.**

```
Wallet & relayer architecture refactor kicking off this week.

The plan:
- Relayer 0.4.1 → 0.5.0, shipping end of next week. Adds @tezosx/relayer/evm
  and @tezosx/relayer/tezos as named entry points alongside the existing
  per-file exports (kept as re-exports through 0.5.x).
- Wallet 0.6.0 → 0.7.0, shipping end of the week after. Adds EVM-native
  accounts (sign EVM tx directly, cross-runtime to tz1 via the NAC precompile)
  and the symmetric Send / Receive / Approve flows. Vault upgrade is
  transparent for existing 0.6.0 users.

Architecture doc and phased implementation plan are in the monorepo:
docs/architecture/architecture-refactor-clean-architecture.md
docs/architecture/implementation-plan-0.7.0.md

Wallet 0.6.0 keeps building unchanged against both 0.4.1 and the upcoming
0.5.0 throughout — back-compat aliases on the relayer side carry the existing
imports. Third-party consumers (Temple, dApp authors building against the
precompile) can opt into the new entry points whenever they're ready; nothing
forces a migration before relayer 0.6.0.

Pinging @François THIRE on SDK questions and @Aurélien Foucault for any
kernel-side details that surface during the work.
```

**Message 2 — posted after relayer 0.5.0 ships, end of week 1.**

```
@tezosx/relayer 0.5.0 is out.

New entry points:
  import { RelayerProvider, BeaconClient } from '@tezosx/relayer/tezos';
  import { encodeNacTransfer, buildCrossRuntimeTx, NAC_PRECOMPILE_ADDR,
           NAC_RECOMMENDED_GAS } from '@tezosx/relayer/evm';
  import type { CrossRuntimeIntent, GatewayCall, PrecompileCall }
    from '@tezosx/relayer/types';

The Tezos entry point is the existing surface (window.ethereum-compatible
EIP-1193 provider that wraps an ITezosWalletClient). The EVM entry point is
new: pure encoders + a high-level builder for an EVM wallet calling the NAC
precompile, plus a status tracker that follows a cross-runtime tx through both
runtimes.

Docs:
- packages/relayer/docs/tezos-consumer.md
- packages/relayer/docs/evm-consumer.md

Existing per-file imports (./provider, ./wallet-client, ./gateway, ./tezlink,
./constants, ./utils/*) still work and will continue to work through 0.5.x.
They are marked @deprecated and scheduled for removal in 0.6.0; migration is
mechanical and we'll publish a migration script with that release.

Wallet 0.7.0 with symmetric EVM accounts ships in two weeks; it'll be the
reference integration. Third-party teams who want to use the EVM entry point
now: examples in the docs, ping me if anything is unclear.
```

### Beyond 0.7.0 (and beyond 0.5.0)

The architecture doc §8 describes phases 5-7 of the wallet and an implicit
phase R4+ of the relayer. Tentative shape for the post-0.7.0 work, not
committed in this plan and not promised in any 0.7.0 communication:

**Wallet 0.7.x patches** for bugs surfaced by the symmetric flow in the first
two weeks of 0.7.0 in the wild.

**Wallet 0.8.0 (architecture doc §5 + §6 phases).** Phases 5 (view models
formalised across all pages), 6 (multi-account UI: switcher, per-account
balance views, account labelling at scale), 7 (custom ERC-20 tokens + activity
tab merging TzKT and blockscout). Estimated 2-3 weeks of focused work; could
ship in two minors (0.8.0 multi-account, 0.9.0 tokens-and-activity) or one
larger 0.8.0 release depending on how the 0.7.0 reception goes.

**Relayer 0.5.x patches** for SDK-side bugs (gas hint corrections, encoder
edge cases, status tracker tuning) as third-party consumers integrate.

**Relayer 0.6.0** removes the deprecated per-file paths. Migration script
published alongside (codemod or just a sed-based one-liner is likely
sufficient).

**Relayer 1.0.0** committed to a stable public API surface, gated on Tezos X
mainnet shipping and the kernel internals freezing. No timeline yet.

None of the above is in scope for the work covered by this plan. Listed here
so the team has a shared picture of what comes next and so 0.7.0 can be
scoped honestly.

---

## Notes for the architect

These are observations on the architecture proposal as it intersects the
execution plan. They are not changes to the architecture — they are flags
worth confirming in the phase-0 meeting.

**Version sequence diverges from architecture doc §5.10.** The architecture doc
proposes `relayer 0.5.0 + wallet 0.5.0` shipping in lockstep. The actual wallet
is at 0.6.0 today (per `packages/wallet/package.json` v0.6.0, last commit
`7a328e3 feat(wallet): 0.6.0 — pending badge, live status timeline, no spinner`).
This plan targets wallet 0.7.0 instead. The architecture doc should be updated
in a follow-up commit to reflect the actual version sequence — happy to do that
as a one-line edit in PR R3 (which already touches the architecture doc's
neighbourhood).

**viem is already a relayer dependency, not the wallet's.** The architecture
doc §10 ("Risk: bundle size") argues for not introducing viem or ethers. That
is correctly enforced for the wallet (the EVM signing helpers in `lib/evm-signing/`
are hand-rolled on `@noble/curves` and `@scure/bip32` — both already transitive
dependencies). On the relayer side, viem is already listed in
`packages/relayer/package.json` (`"viem": "^2.47.2"`); the architecture doc
should clarify that viem is intentionally used in the relayer for the EVM
ABI encoding (`encodeFunctionData`, RLP, etc.) and is *not* an additional
dependency footprint for downstream wallet consumers who only import
`@tezosx/relayer/tezos`.

**`@tezosx/relayer/types` overload.** The current 0.4.1 exports map has
`./types` pointing at `./src/types.ts`. The new plan re-uses `./types` as the
domain-types hub. This works because `./src/types.ts` becomes a re-export of
`./src/domain/index.ts`, so any consumer importing from `@tezosx/relayer/types`
in 0.4.1 keeps getting their old types AND gains the new ones. Worth confirming
no third-party consumer is doing `import type * as Types from '@tezosx/relayer/types'`
and then asserting on the shape of the namespace — wildcard imports would see
the new types appear, which is additive and benign but worth flagging.

**`MichelsonV1Expression` reference in domain.** Architecture doc §5.7's
`GatewayCall.michelineArg: MichelsonV1Expression` pulls a type from
`@taquito/rpc` into the relayer domain. Strictly speaking that ties the domain
layer to a transport library. Pragmatically it's fine because every Tezos
consumer of the gateway is already on Taquito, but if `@tezosx/relayer/evm`
wants to be Taquito-free for pure EVM consumers, the GatewayCall type would
need a Taquito-free `michelineArg: unknown` or a hand-rolled minimal type. Flag
for the phase-0 meeting; defaulting to keeping the Taquito reference is fine
for 0.5.0 since EVM consumers don't construct `GatewayCall` (they construct
`PrecompileCall`, which is Taquito-free).
