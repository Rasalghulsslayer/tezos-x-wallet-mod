# Tezos X Wallet & Relayer — Architecture Refactor towards Clean Architecture

**Author:** Antony Loussararian (Nomadic Labs)
**Status:** Proposal, awaiting team review
**Target release:** 0.5.0 (symmetric wallet + relayer SDK refactor) — phased migration through 0.6.x
**Scope:** both packages — `@tezosx/relayer` (SDK, where cross-runtime logic lives) and `@tezosx/wallet` (UX shell, where keys and orchestration live)

---

## 1. Executive Summary

The Tezos X Wallet currently supports a single account type (Tezos tz1). François has asked us to add the symmetric direction: an EVM-native account (secp256k1) that can sign EVM transactions directly and reach Michelson accounts via the NAC precompile. The straightforward implementation — adding an `if (kind === 'evm')` branch everywhere — would ship in roughly one week but compound the architectural debt we already carry from the original wallet POC.

This document proposes a phased refactor toward Clean Architecture (hexagonal-style ports and adapters) that ships the symmetric wallet in roughly the same calendar time, but leaves the codebase in a state where multi-account support, custom ERC-20 tokens, future runtimes (Tezos X mainnet, other rollups), and the relayer SDK extraction become incremental rather than disruptive.

The work splits cleanly across the two packages of the monorepo. **The cross-runtime functionality (EVM ↔ Michelson) belongs in `@tezosx/relayer`**, which is positioned to become the public SDK for any wallet or dApp building on Tezos X. The wallet (`@tezosx/wallet`) is the first consumer of that SDK and a reference implementation of how to integrate it for a multi-account UX. Treating the relayer as the place where Tezos-X-specific knowledge lives (NAC gateway addresses, precompile signatures, alias derivation, hash resolution, gas hints, status tracking) means that downstream consumers — Temple, MetaMask plugins, Bento, third-party wallets — do not each re-implement that knowledge. They consume it.

The core principle for both packages: the domain model (Account, Transfer, CrossRuntimeCall, TxStatus, Approval, Asset) does not know about Taquito, viem, secp256k1, the Tezlink RPC, React, or `chrome.*`. Concrete signing strategies, provider implementations, balance fetchers, and storage backends are injected at a composition root. The service worker becomes a thin router that wires the right adapters per active account and dispatches messages to pure use cases. The UI receives pre-computed view models and does not reach into domain logic. The relayer exposes runtime-specific entry points (`@tezosx/relayer/tezos` and `@tezosx/relayer/evm`) backed by a shared domain layer.

---

## 2. Why now, why not later

Three factors converge:

**The symmetric wallet is non-trivial.** Adding a second account kind requires touching the vault format, the signer, the provider, the service worker dispatch, the Welcome / Create / Import flows, the AccountCard, the Send page routing, the Approve popup, the balance fetch, and the Receive page. Sprinkling `if (kind === 'evm')` across these ten surfaces means we now have ten places that need updating every time we add a third account kind, a new asset type, or a new chain. Each future addition costs O(N) effort instead of O(1).

**The relayer is becoming an SDK.** François asked for `@tezosx/relayer` to be cleanly extractable as a third-party SDK. The current implementation hardcodes the Tezos signer dependency in the constructor. To ship a credible SDK, the relayer needs to accept any signer that satisfies a documented contract, and provide drop-in adapters for the common cases (Tezos wallet, EVM wallet, future combinations). This is exactly the port-and-adapter pattern.

**Multi-account is next.** Once symmetric ships, the obvious next request is "let me have a Tezos account AND an EVM account in the same wallet" (already implied by François's framing). The current single-`UnlockedIdentity` model in the keyring needs to become a list of accounts with an active selection. Doing this on top of the un-refactored codebase compounds the debt; doing it on top of the refactored codebase is changing one composition function.

The cost of the refactor is bounded — see the migration plan below, it parallelizes the symmetric implementation. The cost of not doing it grows superlinearly with each subsequent feature.

---

## 3. Current state analysis

The wallet already follows a three-layer convention documented in `CLAUDE.md`:

- `lib/` — pure helpers and orchestrators (chrome APIs, fetch, timers wrapped here)
- `ui/tx/` — pure presentation components
- `ui/pages/` and `background/` — orchestrators that compose lib and dispatch user flows

This is a strong foundation. It is not yet Clean Architecture, but the dependency direction (UI → lib, never lib → UI) is right.

The gaps that surface when we try to add EVM:

**Domain types are mixed with infrastructure types.** `VaultPayload` lives in `keyring.ts` next to AES-GCM crypto. `UnlockedIdentity` hardcodes `tz1`, `publicKey`, `secretKey` (a Tezos-encoded edsk). `FormattedError` lives in `lib/errors.ts` next to message-regex parsers. These are mixable today because there is only one runtime. Adding EVM doubles the surface and forces us to either extend the structs (which fails for fields like `secretKey` that have a Tezos encoding) or polymorphize them (which the rest of the code doesn't expect).

**Signing is tied to one library.** `LocalSignerClient` extends `ITezosWalletClient` (defined in the relayer) and wraps `@taquito/signer`'s `InMemorySigner`. The interface is Tezos-shaped: `sendContractCall(entrypoint, michelineArg, mutezAmount)`. There is no equivalent EVM-shaped interface, and there is no neutral interface that abstracts "sign and broadcast a transfer."

**The provider hardcodes a routing strategy.** `RelayerProvider` knows that every `eth_sendTransaction` goes through the NAC gateway KT1 contract, signed by a Tezos key. For an EVM-native account, every `eth_sendTransaction` is just a normal EVM transaction signed by an EVM key — same EIP-1193 surface, completely different implementation. Today's provider can only be one of the two.

**The service worker is the de-facto composition root.** `service-worker.ts` instantiates the Keyring, the LocalSignerClient, the RelayerProvider, and routes messages to handler functions defined inline. There is no separation between "what is the active session" (a state question) and "how do I sign a transfer with this session" (a strategy question). Adding the second account kind means the SW grows a second switch with parallel code paths.

**UI components reach into the domain.** `Home.tsx` reads `state.tz1` and `state.evmAlias` directly. `Send.tsx` reads `state.tz1` to display the source. `AccountCard.tsx` takes `tz1` and `eth` as props. Adding `state.address` for EVM accounts requires every page that reads the identity to fork. The opportunity is to give them view models instead and let them remain runtime-agnostic.

**No unit tests.** The manual-test-script-in-CHANGELOG approach has been workable for a single-account POC but becomes untenable when there are multiple combinations of (account kind, asset, destination, route, error case). A refactored codebase with clean ports enables unit-testing use cases against mock ports, which is the only practical way to keep regression cost down as features stack.

### 3.6 Current state of the relayer

The relayer has its own version of the same problems, in a smaller surface. Its `RelayerProvider` constructor hardcodes a Tezos signer dependency via `ITezosWalletClient`. The `GatewayBuilder` only knows how to build NAC gateway calls in the Michelson → EVM direction. There is no symmetric `PrecompileBuilder` for the EVM → Michelson direction. Everything that ships with the wallet today assumes the user signs on Tezos; nothing in the package is prepared to be consumed by an EVM-native wallet.

More subtly, the relayer mixes its domain (cross-runtime call shapes, alias mappings, hash resolution) with its transport (Taquito Beacon integration, JSON-RPC fetch). For a package whose stated trajectory is "extracted as an SDK," this matters: a third-party consumer who wants the cross-runtime intelligence but uses a different transport (their own RPC client, their own signer) has no clean integration point. The domain needs to live separately from the adapters, and the package needs to expose runtime-specific entry points so consumers import only what they need.

---

## 4. Target architecture (wallet)

The wallet architecture follows Robert Martin's Clean Architecture, with concentric layers and dependencies pointing inward. Outer layers depend on inner ones; inner layers know nothing about outer ones. The relayer follows the same pattern, covered separately in section 5 below.

```
                  ┌──────────────────────────────────────┐
                  │            UI / Frameworks            │  ← React, Chrome MV3,
                  │                                       │    Taquito, viem
                  │   ┌──────────────────────────────┐    │
                  │   │      Adapters                 │   │  ← TezosSigner,
                  │   │                               │   │    EvmSigner,
                  │   │   ┌─────────────────────┐    │   │    ChromeVaultStore,
                  │   │   │   Use Cases          │   │   │    TzktBalanceFetcher
                  │   │   │                      │   │   │
                  │   │   │ ┌────────────────┐  │   │   │  ← SendTransfer,
                  │   │   │ │   Domain        │ │   │   │    UnlockVault,
                  │   │   │ │                 │ │   │   │    ConnectDapp,
                  │   │   │ │  Pure types     │ │   │   │    SignMessage
                  │   │   │ │  & rules        │ │   │   │
                  │   │   │ └────────────────┘  │   │   │  ← Account, Transfer,
                  │   │   │                      │   │   │    TxStatus,
                  │   │   │   Ports (interfaces) │   │   │    FormattedError,
                  │   │   └─────────────────────┘    │   │    Asset, Chain
                  │   │                               │   │
                  │   └──────────────────────────────┘    │  ← SignerPort,
                  │                                       │    ProviderPort,
                  │                                       │    VaultStore, etc.
                  └──────────────────────────────────────┘
```

The four layers in detail:

### 4.1 Domain

Pure TypeScript types and value objects. No imports from `chrome.*`, no `fetch`, no React, no third-party libraries except utility ones (e.g. `@noble/curves` for the cryptographic primitives that are part of the domain definition of an EVM address). The domain is the part of the codebase that does not change when the framework changes.

Key entities:

- `Account` — a discriminated union of `TezosAccount` and `EvmAccount`. Each has a stable `id`, an optional user `label`, a public address, and the public key. Secret material is never on the entity (held separately in the secure vault).
- `TransferRequest` — `{ fromAccountId, toAddress, asset, amount, memo? }`. The amount is `bigint` in the smallest unit (mutez or wei).
- `TransferRoute` — `{ kind, sourceChain, targetChain, via }` where `kind ∈ {'same-runtime', 'cross-runtime'}`, the chains are `'michelson' | 'evm'`, and `via ∈ {'native', 'nac-gateway-l1', 'nac-precompile-l2'}`. This captures the four valid combinations: tz1→tz1 native, tz1→0x via L1 gateway, 0x→0x native, 0x→tz1 via L2 precompile.
- `TxStatus` — the state machine documented in the current `lib/tx-status.ts`, lifted into the domain.
- `Approval` — `Connection | Transaction | Signature` (the third one is new: dApp asks for `personal_sign` or `signTypedData`).
- `Asset` — `{ id, symbol, decimals, runtime, contractAddress? }`. XTZ, USDC, and any future custom token.
- `FormattedError` — the title/detail/raw shape currently in `lib/tezos-errors.ts`, lifted into the domain along with the `KNOWN_ERRORS` registry.

Key domain functions (all pure, all unit-testable in isolation):

- `decideRoute(account: Account, toAddress: string, asset: AssetId): TransferRoute` — replaces the implicit routing logic currently spread between `Send.tsx`, `service-worker.ts`, and `gateway.ts`. Given the active account and a destination, returns the route. Pure function, ten lines, exhaustive over the (sourceKind × destAddressFormat × assetRuntime) matrix.
- `formatError(err: unknown, ctx?): FormattedError` — already exists in `lib/`, moves into `domain/error.ts` with the dispatcher and the catalog. No infrastructure dependency.
- `validateMnemonic`, `validateAddress`, `validateAmount` — pure validators, already in `lib/`.

### 4.2 Use Cases

Application-specific business rules. Each use case is a function (or a small class) that takes a request, a `Deps` parameter holding the ports it needs, and returns a result. Use cases orchestrate the domain but do not implement infrastructure. They are testable with mock ports.

The use cases for the wallet:

- `createAccount(req: { mnemonic, password, kind, label? }, deps): Account`
- `importAccount(req: { source: 'mnemonic' | 'tezos-edsk' | 'evm-privkey', value, password, label?, kind }, deps): Account`
- `unlockVault(req: { password }, deps): UnlockedSession`
- `lockVault(deps): void`
- `listAccounts(deps): Account[]`
- `setActiveAccount(req: { accountId }, deps): void`
- `sendTransfer(req: TransferRequest, deps): SendTransferResult`
- `connectDapp(req: { origin }, deps): Account[]`
- `signMessage(req: { kind: 'personal' | 'typed', message }, deps): string`
- `refreshBalances(req: { accountId }, deps): Record<AssetId, bigint>`
- `listActivity(req: { accountId, limit, cursor? }, deps): ActivityPage`

Use cases live in `src/use-cases/`. Each file exports one use case plus its `Deps` interface. Use cases never `import` from `adapters/` — they only `import` from `domain/` and `ports/`.

### 4.3 Ports

Interfaces that describe what the use cases need from the outside world. They are written from the use case's point of view, not from the infrastructure's. The contract is "I need to send a signed transfer", not "wrap Taquito's `toolkit.contract.transfer`".

The full set:

- `SignerPort` — discriminated union of `TezosSignerPort` and `EvmSignerPort`. Each kind exposes only the operations valid for its runtime: TezosSignerPort has `signMichelsonOp(op)`; EvmSignerPort has `signEvmTx(tx)`, `signPersonalMessage(msg)`, `signTypedData(td)`.
- `ProviderPort` — abstraction over JSON-RPC / Tezos RPC. The transport for broadcasting and reading chain state. `getBalance(addr, asset)`, `getTransactionCount(addr)`, `sendRawTx(rawHex)`, `getChainId()`, etc.
- `VaultStore` — persistence of encrypted vault. `save(payload)`, `load()`, `clear()`. No knowledge of chrome.storage; that's an adapter detail.
- `SessionStore` — per-origin dApp sessions. `list()`, `upsert(session)`, `remove(origin)`.
- `BalanceFetcher` — typed query against on-chain balance, multiple assets. `balanceOf(accountId, assetId): bigint`. Hides whether the source is TzKT, blockscout, or direct RPC.
- `ActivityFetcher` — historical transactions for an account. `list({accountId, limit, cursor})`. Same indirection.
- `NotificationPort` — toolbar badge, popups, system notifications. `setPendingCount(n)`, `openApprovalWindow(req)`, etc.
- `Clock` — `now(): number`. Sounds trivial but allows time-based tests without freezing real time.

Ports live in `src/ports/`. They have no implementation, only interfaces and the minimum value objects they need to declare their shape.

### 4.4 Adapters

Concrete implementations of ports. Each adapter is a class (or a module) that takes some configuration and implements one port. Adapters know about the outside world: Taquito, viem, `@scure/bip32`, `chrome.storage`, `fetch`, TzKT, blockscout, the Tezlink EVM RPC. They are the only place that knows about libraries and network endpoints.

Organized by side:

- `adapters/tezos/` — `TezosSigner` (wraps Taquito InMemorySigner), `TezosProvider` (wraps the existing RelayerProvider logic), `TezosBalanceFetcher` (TzKT + Tezos L1 RPC).
- `adapters/evm/` — `EvmSigner` (uses `@noble/curves/secp256k1` + the signing helpers from `lib/evm-signing/`), `EvmProvider` (direct JSON-RPC to Tezlink EVM RPC, plus the NAC precompile helpers for cross-runtime), `EvmBalanceFetcher` (Tezlink for native, blockscout for ERC-20 + history).
- `adapters/chrome/` — `ChromeVaultStore`, `ChromeSessionStore`, `ChromeNotificationPort`. The wrappers around `chrome.storage.local`, `chrome.windows`, `chrome.action` that already exist in `lib/`, lifted into proper port implementations.

Adapters live in `src/adapters/`. An adapter file `imports` from `ports/` (the interface it implements) and from third-party libraries / `chrome.*`. It does not `import` from `domain/` directly — it works with the types declared in ports, which may pull in domain types via re-export.

### 4.5 Composition root

The single place that knows about both ports and adapters. Given an active account, it returns a fully-wired container of dependencies that the use cases can consume.

```
src/composition/
  container.ts       — factory: Account → Container
  sw-wiring.ts       — service worker entry: instantiate container,
                       route messages to use cases
```

`container.ts` is the only file in the codebase where you'll see `import { TezosSigner } from '../adapters/tezos/tezos-signer'` next to `import type { SignerPort } from '../ports/signer-port'`. Everywhere else either deals exclusively in ports (use cases, domain) or exclusively in adapters (the adapter files themselves).

The composition root pattern means that adding a new chain (Solana? Bitcoin signets?) is a matter of writing new adapters and adding a branch to the factory. The use cases, the domain, and the UI don't change.

---

## 5. Relayer architecture: the cross-runtime SDK

This is where the symmetric work primarily lands. The wallet's job is to manage keys and orchestrate UX flows; the relayer's job is to know how Tezos X cross-runtime mechanics work and to expose them as a clean library that any wallet can consume. Today the relayer hardcodes one direction (a Tezos signer wrapping into a window.ethereum surface). To support the symmetric direction and a future SDK release, it needs to be reorganized around a runtime-agnostic domain with two specialized entry points.

### 5.1 Why the relayer is the right home for cross-runtime logic

Cross-runtime is a Tezos X property, not a wallet property. The NAC gateway address, the precompile signatures, the `transfer(string)` vs `callMichelson(string, string, bytes)` selectors, the binary Michelson encoding rules, the gas budgets, the synthetic-to-real hash mapping — these are all kernel-facing details that change with the protocol, not with the wallet. They belong in one library that all wallets consume.

Putting that knowledge in the wallet creates two problems. First, when a kernel detail changes (a new entrypoint, a new precompile selector, an update to the gas model), every wallet has to update independently. Second, it forces every wallet that wants Tezos X cross-runtime support to re-implement the same encoders, the same routing decisions, the same status-tracking quirks. The relayer SDK is the answer to both — one source of truth, consumed by many wallets.

The wallet stays focused on what it uniquely owns: key management, vault encryption, dApp connection state, the React UI. Everything else is delegated to the relayer.

### 5.2 Current relayer surface

The relayer today is built around a single use case: a Tezos wallet (tz1) wants to expose a `window.ethereum`-compatible provider so that EVM dApps work with it. The public surface is:

- `RelayerProvider` — EIP-1193 provider that wraps an `ITezosWalletClient`, routes `eth_sendTransaction` through the NAC gateway, returns synthetic hashes, resolves real EVM hashes asynchronously.
- `BeaconClient` — an `ITezosWalletClient` implementation for Temple/Beacon-based wallets.
- `GatewayBuilder` — converts an `EthTransactionRequest` (the EVM dApp's perspective) into the corresponding Michelson call against the NAC KT1 gateway.
- `TezlinkClient` — JSON-RPC client for the Tezlink EVM endpoint, used for read-only `eth_*` queries.
- `ITezosWalletClient` — the signer abstraction (one port, currently the only one).
- Hash and receipt helpers in `utils/` — synthetic-hash mapping, real-hash resolver, synthetic-receipt fallback.

This surface is implicitly bound to one direction: **a Michelson signer makes an EVM-shaped call appear normal to an EVM dApp**. There is no equivalent for an EVM signer making a Michelson-shaped call appear normal to a Michelson dApp — because that user story did not exist when the relayer was first built. The symmetric refactor adds it.

### 5.3 The two consumer modes

After the refactor, the relayer exposes two distinct (but related) entry points, each for one kind of consumer wallet:

**Tezos consumer mode (existing, refined).** The wallet holds a tz1 key. It wants to interact with EVM dApps that speak `window.ethereum`. The relayer provides a `RelayerProvider` that wraps the tz1 signer, intercepts `eth_sendTransaction` and friends, translates them into NAC gateway calls signed on Tezos L1, and returns the kernel-synthesized EVM hashes so that ethers.js and viem-based dApps see a normal flow. The wallet's only job is to plug its `ITezosWalletClient` into the provider constructor.

**EVM consumer mode (new).** The wallet holds a secp256k1 key. It does not need a relayer-provided `window.ethereum` shim — the wallet itself already implements EIP-1193 natively for the EVM runtime. What it needs from the relayer is the cross-runtime intelligence: encoders for the NAC precompile, gas hints, builders that take a high-level intent ("send N XTZ from my 0x to this tz1") and return a fully-formed EVM transaction ready to be signed by the wallet's own EVM signer. The wallet sends the transaction through its own provider as usual; the relayer's role is the calldata construction and the post-broadcast status tracking on both sides of the runtime boundary.

Note the asymmetry: in Tezos mode the relayer wraps the wallet's signer and offers a provider; in EVM mode the relayer offers helpers that the wallet uses without wrapping. This reflects the asymmetry of the runtimes themselves — EVM is the lingua franca of dApp tooling, so EVM-native wallets need fewer abstractions to interact with EVM dApps.

### 5.4 Target architecture for the relayer

The relayer follows the same Clean Architecture pattern as the wallet, with concentric layers and inward-pointing dependencies. The layers are smaller because the relayer has no UI and no persistence; it is a pure library.

**Domain.** Runtime-agnostic types and pure functions. `CrossRuntimeDirection`, `CrossRuntimeCall` (a discriminated union of `GatewayCall` and `PrecompileCall`), `TransferIntent`, `MichelsonCallIntent`, `AliasMapping`, `CrossTxStatus`, `RelayerError`. These types describe what a cross-runtime operation is, independent of whether the consumer is a Tezos wallet or an EVM wallet, and independent of any specific transport library.

**Ports.** `ITezosWalletClient` stays (signer abstraction for Tezos consumers). A new `IEvmWalletClient` joins it (signer abstraction for EVM consumers — optional, because EVM wallets often don't need to expose their signer, they just consume the helpers). A `TransportPort` abstracts the underlying RPC channels (Tezos L1 RPC for op injection, Tezlink EVM RPC for reads and EVM broadcasts).

**Use cases.** Pure functions that take an intent and return a call. `buildTezosToEvmCall(intent: TransferIntent | EvmCallIntent, account: TezosAccountInfo): GatewayCall`. `buildEvmToTezosCall(intent: TransferIntent | MichelsonCallIntent, account: EvmAccountInfo): PrecompileCall`. `resolveSyntheticHash(syntheticHash, transport): Promise<string | null>`. `trackCrossRuntimeStatus(hash, direction, transport): AsyncIterable<CrossTxStatus>`. Each is testable in isolation against mock ports.

**Adapters and entry points.** Two runtime-specific modules expose the public API:

- `@tezosx/relayer/tezos` — exports `RelayerProvider`, `BeaconClient`, and the gateway builder. This is the existing surface, lightly cleaned up to use the new domain types under the hood.
- `@tezosx/relayer/evm` — exports `encodeNacTransfer`, `encodeNacCallMichelson`, `buildCrossRuntimeTx`, `NAC_PRECOMPILE_ADDR`, `NAC_RECOMMENDED_GAS`, plus a status tracker that follows an EVM-side cross-runtime tx through both runtimes.
- `@tezosx/relayer/shared` — common utilities: alias derivation, hash mapping, ABI encoding helpers, error types.

The two entry points share the same `domain/`, the same `ports/`, and the same `shared/` helpers. They differ in which adapters they ship.

### 5.5 Folder structure (relayer)

```
packages/relayer/src/
  domain/
    cross-runtime.ts    # Direction, GatewayCall, PrecompileCall, CrossRuntimeCall (union)
    intent.ts           # TransferIntent, MichelsonCallIntent, EvmCallIntent
    alias.ts            # AliasMapping, types
    tx-status.ts        # CrossTxStatus state machine
    error.ts            # RelayerError, GatewayError, PrecompileError types
    chain.ts            # ChainConfig, runtime identifiers
    index.ts

  ports/
    tezos-wallet-client.ts   # ITezosWalletClient (existing, kept)
    evm-wallet-client.ts     # IEvmWalletClient (new, optional consumer interface)
    transport.ts             # TransportPort (Tezos RPC + EVM RPC abstraction)
    index.ts

  use-cases/
    build-tezos-to-evm-call.ts     # intent → GatewayCall
    build-evm-to-tezos-call.ts     # intent → PrecompileCall
    resolve-synthetic-hash.ts      # synthetic → real EVM hash
    build-synthetic-receipt.ts     # for fallback when real hash never resolves
    track-cross-runtime-status.ts  # status timeline for cross-runtime ops
    derive-alias.ts                # tz1 ↔ 0x alias mapping
    index.ts

  shared/
    constants.ts        # NAC_GATEWAY_KT1, NAC_PRECOMPILE_ADDR, NAC_RECOMMENDED_GAS, etc.
    abi.ts              # minimal ABI encoder for precompile signatures
    keccak.ts           # selector hashing
    rpc.ts              # JSON-RPC fetch wrapper
    hex.ts, async.ts    # cross-cutting utilities
    index.ts            # NOT re-exported publicly; used internally

  tezos/                # Entry point: @tezosx/relayer/tezos
    provider.ts         # RelayerProvider (EIP-1193 for Tezos-consumer wallets)
    beacon.ts           # BeaconClient (Temple/Beacon impl of ITezosWalletClient)
    tezlink.ts          # TezlinkClient (EVM RPC reads from Tezos consumer side)
    index.ts            # public re-exports

  evm/                  # Entry point: @tezosx/relayer/evm
    encoders.ts         # encodeNacTransfer, encodeNacCallMichelson
    builders.ts         # buildCrossRuntimeTx (high-level intent → EVM tx ready to sign)
    status-tracker.ts   # follow an EVM-side cross-runtime tx through Michelson effects
    index.ts            # public re-exports
```

The package's `package.json` exports map directs consumers to the right submodule:

```json
{
  "exports": {
    ".":           "./dist/index.js",
    "./tezos":     "./dist/tezos/index.js",
    "./evm":       "./dist/evm/index.js",
    "./types":     "./dist/domain/index.js"
  }
}
```

Consumers `import { RelayerProvider } from '@tezosx/relayer/tezos'` or `import { encodeNacTransfer } from '@tezosx/relayer/evm'` and get only the surface they need. Tree-shaking removes the rest.

### 5.6 Public API (both modes)

**Tezos consumer (existing, slightly refined):**

```ts
import { RelayerProvider, BeaconClient } from '@tezosx/relayer/tezos';
import type { ITezosWalletClient } from '@tezosx/relayer/types';

// Either use the provided BeaconClient for Temple integration:
const walletClient: ITezosWalletClient = new BeaconClient(/* … */);

// Or implement ITezosWalletClient yourself for a custom wallet (like ours):
class MyLocalSigner implements ITezosWalletClient { /* … */ }
const walletClient = new MyLocalSigner();

const provider = new RelayerProvider(walletClient);

// Now provider is a window.ethereum-compatible EIP-1193 surface
await provider.request({ method: 'eth_sendTransaction', params: [{ to: '0x…', value: '0x…' }] });
```

The existing API is preserved verbatim — the wallet's current integration does not need to change for phase 5.

**EVM consumer (new):**

```ts
import {
  encodeNacTransfer,
  encodeNacCallMichelson,
  buildCrossRuntimeTx,
  NAC_PRECOMPILE_ADDR,
  NAC_RECOMMENDED_GAS,
  trackCrossRuntimeStatus,
} from '@tezosx/relayer/evm';

// Low-level: encode the calldata yourself
const calldataA = encodeNacTransfer('tz1KqTpEZ7Yob7QbPE4Hy4Wo8fHG8LhKxZSx');
const calldataB = encodeNacCallMichelson(
  'KT1ContractAddress',
  'entrypoint_name',
  '0x020000002d07070100…', // binary Michelson (from octez-client convert)
);

// Then build, sign, and broadcast via your own EVM wallet:
const tx = {
  to:       NAC_PRECOMPILE_ADDR,
  value:    1_000_000_000_000_000_000n, // 1 XTZ in wei
  data:     calldataA,
  gasLimit: NAC_RECOMMENDED_GAS.transfer, // 3M
};
const signedRaw = await myEvmSigner.signTransaction(tx);
const hash      = await myEvmProvider.sendRawTransaction(signedRaw);

// Higher-level: let the relayer build the whole tx from a typed intent
const tx2 = await buildCrossRuntimeTx({
  kind:        'transfer',
  destination: 'tz1KqTp…xZSx',
  amount:      1_000_000n,                    // mutez; relayer converts to wei
  fromAddress: myEvmAddress,
}, transport);
// tx2 is fully populated: to, value, data, gasLimit, nonce, fees.
// Wallet just signs + broadcasts.

// Track the cross-runtime effect (EVM hash now, Michelson opHash side-effect after kernel processing)
for await (const status of trackCrossRuntimeStatus(hash, 'evm-to-michelson', transport)) {
  // 'broadcasting' → 'included-evm' → 'michelson-effect-confirmed' → 'finalized'
  console.log(status);
}
```

### 5.7 Domain types (relayer)

```ts
// domain/cross-runtime.ts

export type CrossRuntimeDirection = 'michelson-to-evm' | 'evm-to-michelson';

export interface GatewayCall {
  direction:     'michelson-to-evm';
  contractAddr:  string;                    // KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw
  entrypoint:    'default' | 'call_evm';
  michelineArg:  MichelsonV1Expression;     // Taquito Micheline shape
  mutezAmount:   bigint;
}

export interface PrecompileCall {
  direction:    'evm-to-michelson';
  to:           `0xff${string}`;            // NAC_PRECOMPILE_ADDR
  data:         `0x${string}`;
  value:        bigint;                      // wei (kernel converts to mutez)
  gasLimit:     bigint;
}

export type CrossRuntimeCall = GatewayCall | PrecompileCall;

// domain/intent.ts — high-level user-intent before encoding
export type CrossRuntimeIntent =
  | { kind: 'transfer';         destination: string; amount: bigint /* in source unit */ }
  | { kind: 'call-michelson';   destination: string; entrypoint: string; binaryMicheline: string; value?: bigint }
  | { kind: 'call-evm';         destination: string; methodSig: string; abiParamsHex: string; value?: bigint };

// domain/tx-status.ts — works for both directions
export type CrossTxStatus =
  | { stage: 'broadcasting' }
  | { stage: 'included-source';        sourceBlock: number }
  | { stage: 'included-target';        sourceBlock: number; targetBlock: number }
  | { stage: 'finalized';              sourceBlock: number; targetBlock: number; confirmations: number }
  | { stage: 'failed';                 reason: string }
  | { stage: 'unresolved-target';      sourceBlock: number };
```

The `CrossRuntimeCall` union captures the fundamental insight: a cross-runtime operation is one of exactly two shapes — a Michelson op against the L1 gateway, or an EVM tx against the L2 precompile. The wallet picks the shape based on which key it holds. The relayer provides builders for both.

### 5.8 Use case example: `buildEvmToTezosCall`

```ts
// use-cases/build-evm-to-tezos-call.ts

import type { CrossRuntimeIntent, PrecompileCall } from '../domain';
import { encodeNacTransfer, encodeNacCallMichelson } from '../shared/abi';
import { NAC_PRECOMPILE_ADDR, NAC_RECOMMENDED_GAS } from '../shared/constants';

export function buildEvmToTezosCall(intent: CrossRuntimeIntent): PrecompileCall {
  if (intent.kind === 'transfer') {
    return {
      direction: 'evm-to-michelson',
      to:        NAC_PRECOMPILE_ADDR,
      value:     intent.amount * 1_000_000_000_000n,  // mutez → wei
      data:      encodeNacTransfer(intent.destination),
      gasLimit:  NAC_RECOMMENDED_GAS.transfer,
    };
  }
  if (intent.kind === 'call-michelson') {
    return {
      direction: 'evm-to-michelson',
      to:        NAC_PRECOMPILE_ADDR,
      value:     (intent.value ?? 0n) * 1_000_000_000_000n,
      data:      encodeNacCallMichelson(
        intent.destination,
        intent.entrypoint,
        intent.binaryMicheline,
      ),
      gasLimit:  NAC_RECOMMENDED_GAS.callMichelson,
    };
  }
  throw new Error(`Cannot build evm-to-tezos call for intent kind '${intent.kind}'`);
}
```

This function is pure. It does not touch the network. Given an intent, it returns a fully-specified call that the consumer wallet can plug into its own EVM signing pipeline. It is unit-testable with a one-line `expect` against a known-good output.

### 5.9 How the wallet consumes the relayer

The wallet imports from one or the other entry point based on the active account's kind:

```ts
// In the wallet's composition root (composition/container.ts)

import type { Account } from '../domain/account';

if (account.kind === 'tezos') {
  // Use the existing Tezos-consumer path
  const { RelayerProvider } = await import('@tezosx/relayer/tezos');
  const localSigner = new MyTezosLocalSigner(account, secrets);
  const provider    = new RelayerProvider(localSigner);
  return { provider, /* … */ };
}

// EVM account
const { buildCrossRuntimeTx, NAC_RECOMMENDED_GAS } = await import('@tezosx/relayer/evm');
const evmSigner    = new MyEvmLocalSigner(account, secrets);
const evmProvider  = new EvmProvider(evmSigner, TEZLINK_EVM_RPC);
// EVM accounts don't need a relayer-wrapped provider — they sign EVM tx natively.
// The relayer's role here is the cross-runtime tx builder used inside sendTransfer use case.
return { provider: evmProvider, crossRuntimeBuilder: buildCrossRuntimeTx, /* … */ };
```

The `sendTransfer` use case in the wallet (from section 6 of this document) doesn't know about the relayer's internals. It receives a `BuildCrossRuntimeTx` port; the composition root wires it to the relayer's `buildCrossRuntimeTx` function for EVM accounts. For Tezos accounts, the cross-runtime path is encapsulated inside the `RelayerProvider`'s `eth_sendTransaction` handler — the wallet sees a generic EIP-1193 provider and calls it.

This decoupling is what makes the relayer a real SDK: a third-party wallet developer can integrate `@tezosx/relayer/tezos` for their tz1 users and `@tezosx/relayer/evm` for their 0x users without ever seeing the internals of how the NAC gateway works. They get composability and the kernel details stay in one place.

### 5.10 Versioning and the SDK release path

The relayer is currently at 0.4.x. The refactor outlined here is a substantial reorganization but maintains backward compatibility on the existing public surface (`RelayerProvider`, `BeaconClient`, `ITezosWalletClient`, `GatewayBuilder`). The new EVM module is additive.

Recommended cadence:

- `0.5.0` ships the domain extraction, the ports, the `@tezosx/relayer/evm` entry point, and the refactor of internals. Public API additive. Wallet 0.5.0 consumes it.
- `0.5.x` patch releases as needed for EVM-side bug fixes (gas defaults, ABI encoder edge cases, status tracker tweaks).
- `1.0.0` of the relayer is the moment we commit to stability for third-party consumers. Not before Tezos X mainnet is live and the kernel internals stabilize.

The package name stays `@tezosx/relayer`. If we want a more SDK-flavored name for the marketing surface (e.g. `@tezosx/sdk`), we can add it as an alias in `package.json` later without breaking existing imports.

---

## 6. Folder structure (target — wallet)

```
packages/wallet/src/
  domain/
    account.ts           # Account, TezosAccount, EvmAccount, AccountKind
    transfer.ts          # TransferRequest, TransferRoute, decideRoute
    tx-status.ts         # TxStatus state machine
    approval.ts          # Approval, Connection, Transaction, Signature
    asset.ts             # Asset, AssetBalance, AssetId
    chain.ts             # ChainConfig, RuntimeId
    error.ts             # FormattedError, KNOWN_ERRORS, formatError
    validation.ts        # validateMnemonic, validateAddress, validateAmount
    index.ts             # public re-exports

  ports/
    signer-port.ts       # SignerPort, TezosSignerPort, EvmSignerPort
    provider-port.ts     # ProviderPort
    vault-store.ts       # VaultStore
    session-store.ts     # SessionStore
    balance-fetcher.ts   # BalanceFetcher
    activity-fetcher.ts  # ActivityFetcher
    notification-port.ts # NotificationPort
    clock.ts             # Clock
    index.ts             # public re-exports

  use-cases/
    create-account.ts
    import-account.ts
    unlock-vault.ts
    lock-vault.ts
    list-accounts.ts
    set-active-account.ts
    send-transfer.ts
    connect-dapp.ts
    sign-message.ts
    refresh-balances.ts
    list-activity.ts
    index.ts

  adapters/
    tezos/
      tezos-signer.ts
      tezos-provider.ts
      tezos-balance-fetcher.ts
      tezos-activity-fetcher.ts
      nac-gateway-builder.ts   # moved from relayer/src/gateway.ts
    evm/
      evm-signer.ts
      evm-provider.ts
      evm-balance-fetcher.ts
      evm-activity-fetcher.ts
      nac-precompile-builder.ts
    chrome/
      chrome-vault-store.ts
      chrome-session-store.ts
      chrome-notification.ts

  composition/
    container.ts
    sw-wiring.ts
    constants.ts          # network-level constants: TZKT_API_BASE, etc.

  ui/
    pages/                # current pages, refactored to take ViewModels
    tx/                   # design system, unchanged
    view-models/          # selectors: Account → AccountCardVM, etc.
    App.tsx

  lib/                    # truly shared utilities, much smaller than today
    hex.ts
    base58.ts
    format.ts             # mutezToXtz, weiToXtz, truncateAddress
    poller.ts             # generic poll-with-cancel engine (unchanged)
    messaging.ts          # typed chrome.runtime.sendMessage wrapper
    buffer-shim.ts        # Taquito polyfill (unchanged)

  background/
    service-worker.ts     # thin entry, delegates to composition/sw-wiring.ts

  content/
    bridge.ts             # unchanged

  injected/
    provider.ts           # unchanged (the window.ethereum injection)
```

The `lib/` folder shrinks dramatically. Everything that was "logic dressed up as a utility" moves into `domain/`, `adapters/`, or `use-cases/`. What stays in `lib/` are genuinely cross-cutting utilities with no domain meaning.

---

## 7. Concrete examples

### 7.1 Domain: `decideRoute`

```ts
// domain/transfer.ts
export type RuntimeId = 'michelson' | 'evm';

export interface TransferRoute {
  sourceChain: RuntimeId;
  targetChain: RuntimeId;
  via:         'native' | 'nac-gateway-l1' | 'nac-precompile-l2';
}

export function decideRoute(
  account: Account,
  toAddress: string,
  asset: Asset,
): TransferRoute {
  const sourceChain: RuntimeId = account.kind === 'tezos' ? 'michelson' : 'evm';
  const targetChain: RuntimeId = isTezosAddress(toAddress) ? 'michelson' : 'evm';

  if (sourceChain === targetChain) {
    return { sourceChain, targetChain, via: 'native' };
  }
  if (sourceChain === 'michelson' && targetChain === 'evm') {
    return { sourceChain, targetChain, via: 'nac-gateway-l1' };
  }
  if (sourceChain === 'evm' && targetChain === 'michelson') {
    return { sourceChain, targetChain, via: 'nac-precompile-l2' };
  }
  throw new Error('unreachable');
}
```

Pure function. No imports from outside `domain/`. Trivially unit-testable.

### 7.2 Use case: `sendTransfer`

```ts
// use-cases/send-transfer.ts
import type { TransferRequest, TransferRoute } from '../domain/transfer';
import type { SignerPort } from '../ports/signer-port';
import type { ProviderPort } from '../ports/provider-port';
import type { BalanceFetcher } from '../ports/balance-fetcher';
import { decideRoute } from '../domain/transfer';
import { InsufficientFundsError, UnsupportedRouteError } from '../domain/error';

export interface SendTransferDeps {
  signer:         SignerPort;
  provider:       ProviderPort;
  balanceFetcher: BalanceFetcher;
}

export interface SendTransferResult {
  hash:    string;
  runtime: 'l1' | 'l2' | 'l1-via-evm';
  route:   TransferRoute;
}

export async function sendTransfer(
  req: TransferRequest,
  deps: SendTransferDeps,
): Promise<SendTransferResult> {
  const balance = await deps.balanceFetcher.balanceOf(
    deps.signer.account.id, req.asset,
  );
  if (balance < req.amount) {
    throw new InsufficientFundsError({ requested: req.amount, available: balance });
  }

  const route = decideRoute(deps.signer.account, req.toAddress, req.asset);

  if (deps.signer.kind === 'tezos' && route.via === 'native') {
    const op     = buildTezosNativeTransfer(req);
    const opHash = await deps.signer.signMichelsonOp(op);
    return { hash: opHash, runtime: 'l1', route };
  }
  if (deps.signer.kind === 'tezos' && route.via === 'nac-gateway-l1') {
    const op     = buildTezosNacGatewayCall(req);
    const opHash = await deps.signer.signMichelsonOp(op);
    return { hash: opHash, runtime: 'l2', route };
  }
  if (deps.signer.kind === 'evm' && route.via === 'native') {
    const tx     = await buildEvmTransfer(req, deps.provider);
    const rawTx  = await deps.signer.signEvmTx(tx);
    const hash   = await deps.provider.sendRawTx(rawTx);
    return { hash, runtime: 'l2', route };
  }
  if (deps.signer.kind === 'evm' && route.via === 'nac-precompile-l2') {
    const tx     = await buildEvmToMichelsonTransfer(req, deps.provider);
    const rawTx  = await deps.signer.signEvmTx(tx);
    const hash   = await deps.provider.sendRawTx(rawTx);
    return { hash, runtime: 'l1-via-evm', route };
  }
  throw new UnsupportedRouteError(route, deps.signer.kind);
}
```

This function knows nothing about Taquito, viem, `chrome.*`, React, or the specific network endpoints. It can be unit-tested with a mock `SignerPort` that records the operations and returns a canned hash. The four branches map exactly to the four valid (source, target) pairs, and the type system enforces exhaustiveness if we use a tagged union for the route discriminator.

### 7.3 Adapter: `EvmSigner`

```ts
// adapters/evm/evm-signer.ts
import type { EvmSignerPort } from '../../ports/signer-port';
import type { EvmAccount, EvmTxRequest, TypedData } from '../../domain';
import {
  signTransaction1559,
  signPersonalMessage,
  signTypedDataV4,
} from '../../lib/evm-signing';

export class EvmSigner implements EvmSignerPort {
  readonly kind = 'evm' as const;

  constructor(
    readonly account: EvmAccount,
    private readonly privateKey: string,
  ) {}

  async signEvmTx(tx: EvmTxRequest): Promise<string> {
    return signTransaction1559(tx, this.privateKey);
  }

  async signPersonalMessage(msg: string | Uint8Array): Promise<string> {
    return signPersonalMessage(msg, this.privateKey);
  }

  async signTypedData(td: TypedData): Promise<string> {
    return signTypedDataV4(td, this.privateKey);
  }
}
```

The adapter is thin. Most of the complexity lives in `lib/evm-signing/` which is also infrastructure (no domain logic). The adapter's job is to satisfy the port contract using whatever library makes sense — here, our local signing helpers built on `@noble/curves`.

### 7.4 Composition root: `container.ts`

```ts
// composition/container.ts
import type { Account } from '../domain/account';
import type { Container, AccountSecrets } from './types';
import { TezosSigner } from '../adapters/tezos/tezos-signer';
import { TezosProvider } from '../adapters/tezos/tezos-provider';
import { TezosBalanceFetcher } from '../adapters/tezos/tezos-balance-fetcher';
import { EvmSigner } from '../adapters/evm/evm-signer';
import { EvmProvider } from '../adapters/evm/evm-provider';
import { EvmBalanceFetcher } from '../adapters/evm/evm-balance-fetcher';
import { ChromeVaultStore } from '../adapters/chrome/chrome-vault-store';
import { ChromeSessionStore } from '../adapters/chrome/chrome-session-store';
import { ChromeNotification } from '../adapters/chrome/chrome-notification';
import {
  TEZLINK_EVM_RPC, TEZOS_L1_RPC, TZKT_API_BASE,
  BLOCKSCOUT_API_BASE, NAC_GATEWAY_KT1, NAC_PRECOMPILE_ADDR,
} from './constants';

const vaultStore    = new ChromeVaultStore();
const sessionStore  = new ChromeSessionStore();
const notifications = new ChromeNotification();

export function buildContainer(account: Account, secrets: AccountSecrets): Container {
  if (account.kind === 'tezos') {
    const signer = new TezosSigner(account, secrets.tezosSecretKey!, TEZOS_L1_RPC);
    return {
      signer,
      provider:       new TezosProvider(signer, NAC_GATEWAY_KT1, TEZLINK_EVM_RPC),
      balanceFetcher: new TezosBalanceFetcher(TZKT_API_BASE, TEZLINK_EVM_RPC),
      vaultStore,
      sessionStore,
      notifications,
    };
  }
  const signer = new EvmSigner(account, secrets.evmPrivateKey!);
  return {
    signer,
    provider:       new EvmProvider(signer, TEZLINK_EVM_RPC, NAC_PRECOMPILE_ADDR),
    balanceFetcher: new EvmBalanceFetcher(TEZLINK_EVM_RPC, BLOCKSCOUT_API_BASE),
    vaultStore,
    sessionStore,
    notifications,
  };
}
```

This is the only file that imports both ports and concrete adapters. The use cases never see this file directly; they see the `Container` type, which is a record of port types.

### 7.5 Service worker: thin wiring

```ts
// background/service-worker.ts
import { dispatchPopupRequest } from '../composition/sw-wiring';
import { buildContainer } from '../composition/container';
import { Keyring } from '../adapters/chrome/keyring';

const keyring = new Keyring();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  void (async () => {
    const session = keyring.getUnlocked();
    const container = session
      ? buildContainer(session.account, session.secrets)
      : null;
    const response = await dispatchPopupRequest(msg, { container, keyring });
    sendResponse(response);
  })();
  return true;
});
```

The SW becomes 30 lines instead of 300. All the dispatch logic is in `composition/sw-wiring.ts`, which is a routing table from message type to use case invocation, and is itself trivial.

### 7.6 UI: view models

```ts
// ui/view-models/account-card-vm.ts
import type { Account } from '../../domain/account';
import { truncateAddress } from '../../lib/format';

export interface AccountCardVM {
  primary:   { label: string; runtime: 'l1' | 'l2' };
  secondary: { label: string; runtime: 'l1' | 'l2' } | null;
  badges:    Array<{ kind: 'label' | 'testnet'; value: string }>;
}

export function toAccountCardVM(account: Account): AccountCardVM {
  if (account.kind === 'tezos') {
    return {
      primary:   { label: truncateAddress(account.tz1, 6), runtime: 'l1' },
      secondary: { label: truncateAddress(deriveEvmAlias(account.tz1), 6), runtime: 'l2' },
      badges:    account.label ? [{ kind: 'label', value: account.label }] : [],
    };
  }
  return {
    primary:   { label: truncateAddress(account.address, 6), runtime: 'l2' },
    secondary: null,
    badges:    account.label ? [{ kind: 'label', value: account.label }] : [],
  };
}
```

And `AccountCard.tsx` becomes:

```tsx
export function AccountCard({ vm }: { vm: AccountCardVM }) {
  return (
    <div className="tx-account-card">
      <Row {...vm.primary} />
      {vm.secondary && <Row {...vm.secondary} />}
      <BadgeRow badges={vm.badges} />
    </div>
  );
}
```

The component is now runtime-agnostic. It would render correctly for a Solana account if we ever added one. The runtime-specific logic lives in the selector, which is pure and testable.

---

## 8. Migration plan

The refactor is significant in aggregate but parallelizable in phases across both packages. The plan is designed so that the symmetric wallet can ship at the end of phase 4 (roughly 2 weeks of work) and the remaining phases are no-regret follow-ups that can be released independently. Relayer phases are interleaved because most wallet work depends on the relayer exposing the right SDK surface.

**Phase 0 — alignment, ~1 day.** This document. Get team approval on the architecture, lock down the domain types and the port signatures. No code change.

**Phase 1 — domain extraction, ~3 days.** Create `domain/` and move pure types and functions from `lib/`: `tezos-errors.ts` → `domain/error.ts`, `address.ts` → `domain/validation.ts` plus address type into `domain/account.ts`, `tx-status.ts` types → `domain/tx-status.ts`. The implementations stay in `lib/` for now and import from `domain/`. Behavior unchanged. Single PR, easy to review.

**Phase 2 — port introduction, ~3 days.** Create `ports/` with interface definitions. Refactor `signer.ts` → `adapters/tezos/tezos-signer.ts` implementing `TezosSignerPort`. Move the relayer's `provider.ts` logic into `adapters/tezos/tezos-provider.ts` implementing `ProviderPort`. Move `balances.ts` into `adapters/tezos/tezos-balance-fetcher.ts`. Add `composition/container.ts` with the single-Tezos-account branch. The SW now uses the container. Behavior unchanged. PR per adapter for review tractability.

**Phase 3 — use case extraction, ~3 days.** Extract SW message handlers into `use-cases/`. Each handler becomes a pure function `(req, deps) => result`. SW becomes thin. Now the use cases are unit-testable in isolation. Behavior unchanged. PR per use case batch (e.g. auth use cases, transfer use cases, dApp use cases).

**Phase 4 — EVM adapter, ~3 days. THIS IS WHERE SYMMETRIC SHIPS.** Add `domain/account.ts` `EvmAccount` type. Add `adapters/evm/evm-signer.ts`, `evm-provider.ts`, `evm-balance-fetcher.ts`. Extend `composition/container.ts` to dispatch on `account.kind`. Extend `unlockVault` and `createAccount` use cases to handle the EVM kind. Add the UI surface: Welcome toggle, Create/Import EVM variants, Send routing for EVM source, Approve signature view. Ship as 0.5.0.

Phase 4 of the wallet depends on phases R1-R3 of the relayer (see below) completing first or in parallel. The wallet imports from `@tezosx/relayer/evm` for the cross-runtime helpers; that surface needs to exist.

**Phases R1-R3 — relayer refactor, ~5 days, runs in parallel with wallet phases 1-3.**

R1 (~2 days): Extract the relayer's domain into `packages/relayer/src/domain/`. `CrossRuntimeCall`, `TransferIntent`, `CrossTxStatus`, `RelayerError`, alias mapping types. Move existing pure code from `utils/` into the domain. Behavior unchanged.

R2 (~2 days): Add the new EVM entry point. Create `packages/relayer/src/evm/` with `encoders.ts`, `builders.ts`, `status-tracker.ts`. Export from `package.json` exports map. The Tezos entry point at `packages/relayer/src/tezos/` is the existing code path, lightly cleaned to use the new domain types under the hood. Refactor `GatewayBuilder` into a use case `buildTezosToEvmCall` that the `RelayerProvider` calls internally. Public API unchanged.

R3 (~1 day): Add `IEvmWalletClient` port for consumers that want a fuller integration than the helpers (optional). Write the README / API reference for the SDK consumers — both Tezos and EVM entry points documented with examples.

Phase R0 is implicit: this document. Phase R4+ is the SDK stabilization toward 1.0.0 of the relayer, post Tezos X mainnet.

**Phase 5 — view models, ~2 days.** Extract `view-models/` from current pages. AccountCard, Home hero, Send routing card, Receive toggle all become VM-driven. Pages become runtime-agnostic. Behavior unchanged. Cosmetic refactor that pays off for phase 6 and beyond. Ship as 0.5.1 or batch with phase 6.

**Phase 6 — multi-account, ~3 days.** Vault now stores a list of accounts plus an active-account ID. AccountCard becomes a switcher. Container caches per accountId. `setActiveAccount` use case. The architecture already supports this — the refactor is mostly in `keyring.ts` (now `chrome-vault-store.ts`) and the AccountCard UI. Ship as 0.6.0.

**Phase 7 — custom tokens and activity, ~3 days.** `AssetSpec` registry in domain, populated by user. `BalanceFetcher` and `ActivityFetcher` adapters read it. Activity page renders the merged feed from `tezos-activity-fetcher` (TzKT) and `evm-activity-fetcher` (blockscout). Ship as 0.6.1 or 0.7.0.

Total runway: roughly 3 weeks of focused work for everything through phase 6. Phase 4 alone, ahead of which phases 1-3 are required, lands at the end of week 2 — matching the original 1-2 week estimate for the symmetric wallet, but with the architecture cleaned up rather than degraded.

---

## 9. What this refactor enables

The proximate goal is the symmetric wallet. The downstream consequences are larger:

**Multi-account becomes a one-PR feature.** Phase 6 is small because phases 1-5 did the structural work. Adding a third account, a fourth, switching, labelling, exporting — all are operations on a list of `Account` rather than re-architecting the vault.

**Custom ERC-20 tokens become user-driven.** Add an `Asset` to the registry, the BalanceFetcher and the Send / Receive UI pick it up without code change in the use cases. Phase 7 is mostly about the registry UI in Settings.

**Activity tab becomes a real feature.** The current stub becomes a use case that calls two `ActivityFetcher` adapters and merges, sorts, and paginates. UI is a list of view models.

**SDK extraction is the headline win.** After this refactor `@tezosx/relayer` is no longer a thin Tezos-only wrapper bound to one wallet — it is a proper SDK with `@tezosx/relayer/tezos` for tz1-based wallets, `@tezosx/relayer/evm` for 0x-based wallets, and a shared cross-runtime domain that both consume. Third-party teams (Temple integrating Tezos X, MetaMask snap developers, Bento, FA2 wrapper authors like Charles, dApp developers building on the precompile like Adebola's tzbutton) all get the same one source of truth for kernel-facing details. Our own wallet becomes the reference integration that proves the pattern; that's what makes the SDK credible.

**Future runtimes are additive.** When Tezos X mainnet ships, the only change is the constants file (new RPC endpoints, new chain ID). When (or if) Tezos X gets a third runtime, it's a new adapter pack. The domain doesn't care.

**Unit tests become possible.** Use cases can be tested against mock ports. Adapters can be tested against fixture HTTP responses. Domain functions are already pure. This is the only realistic path to keeping regression cost manageable as the feature surface grows.

---

## 10. Risks and mitigations

**Risk: scope creep.** Refactoring is the kind of work that expands. Mitigation: phases 1-4 are gated by behavior preservation, not perfection. We do the minimum to enable symmetric, ship it, and iterate. Phases 5-7 are explicitly post-symmetric.

**Risk: behavioral regression.** Moving code across boundaries can introduce subtle bugs. Mitigation: each phase 1-3 PR is a no-op refactor — same inputs produce same outputs. The manual test scripts in CHANGELOG entries get re-run for each PR. Adding a small Jest suite for the domain and use cases during phase 3 is a deliberate investment.

**Risk: team unfamiliarity with Clean Architecture vocabulary.** "Ports and adapters" is jargon. Mitigation: keep CLAUDE.md updated as the layers stabilize, with concrete examples. The pattern is more important than the name; even if we never call it Clean Architecture in PR descriptions, the structural discipline is what matters.

**Risk: bundle size.** Abstractions in TypeScript are erased at build time, but library footprint matters. Mitigation: don't add `viem` or `ethers` "because the architecture allows it." The EVM signing is built on `@noble/curves` and `@scure/bip32`, already transitive dependencies. The EVM provider does direct JSON-RPC `fetch`. The bundle stays in the same order of magnitude.

**Risk: longer initial PR than a quick hack.** The phased plan results in 6-8 PRs over 2 weeks instead of one big PR over 1 week. Mitigation: each PR is independently reviewable and shippable. The team gets visibility into the refactor as it happens, which is healthier than a single 5,000-line PR that nobody can review.

---

## 11. Open questions for the team

The following decisions are worth pinning down before phase 1 starts.

**Multi-account simultaneity.** Should a single vault hold a Tezos account and an EVM account at the same time (like MetaMask holds multiple chains), or is each vault one-kind-only (like having a separate Temple and MetaMask)? The architecture supports both; the UX question is whether the user thinks of their wallet as "my Tezos X identity" or "my Tezos identity + my EVM identity". Recommendation: support both in one vault, with an active-account selector. This matches MetaMask's mental model that users already know.

**Account ID generation.** UUID v4 (random, stable across renames) or deterministic from the public key (no extra state to track)? Recommendation: UUID v4. Deterministic IDs leak the address in URLs and storage keys; UUID gives us privacy and rename stability.

**Vault format migration.** Existing 0.4.x users have a vault with `{ kind: 'mnemonic' | 'edsk', value: string }`. The new format is `{ accounts: Account[], active: string, secrets: Record<accountId, Encrypted> }`. We need a migration path. Recommendation: detect the old format on unlock, transparently upgrade to the new format with one account, save back. The user sees nothing.

**SDK boundary.** The proposal here is to expose two entry points (`@tezosx/relayer/tezos` and `@tezosx/relayer/evm`) plus a shared types module (`@tezosx/relayer/types`). An alternative is one flat surface that consumers tree-shake. Recommendation: explicit entry points. They communicate intent ("this is the EVM-consumer side") and make consumers' imports self-documenting. Tree-shaking still removes anything unused.

**Relayer 1.0.0 timing.** When do we commit to a stable public API for `@tezosx/relayer`? Recommendation: not before Tezos X mainnet is live and the kernel internals (gas model, alias forwarder semantics, fee constants) are frozen. Until then we ship 0.5.x, 0.6.x and explicitly version-pin in consumers. The wallet 0.5.0 ships against relayer 0.5.0 and they move in lockstep.

**Builders vs encoders in the EVM entry point.** Should `@tezosx/relayer/evm` expose only low-level encoders (`encodeNacTransfer`, `encodeNacCallMichelson`) or also high-level builders (`buildCrossRuntimeTx`)? Recommendation: both. Low-level encoders are honest about what they do and let the consumer wire their own transaction shape. High-level builders are convenient for the 80% case and let us encode best-practice (correct gas hints, correct value conversion, sensible defaults) once for everyone.

---

## 12. Recommendation

Proceed with wallet phases 0-4 plus relayer phases R1-R3 over two weeks for the 0.5.0 symmetric wallet release. Phases 5-7 on the wallet side and R4+ on the relayer side are follow-ups that ship independently in 0.5.x, 0.6.x, and beyond. The work parallelizes well: relayer phases R1-R3 can run alongside wallet phases 1-3 because they touch different packages; phase 4 of the wallet then plugs into the relayer's new EVM entry point.

The refactor pays back on the very next feature (multi-account, custom tokens, activity, third-party SDK integrations) and sets the architectural foundation for the relayer SDK that François has asked for and that the broader Tezos X ecosystem will rely on.

The alternative — shipping symmetric as a quick `if/else` branch in the wallet and leaving the relayer as a Tezos-only blob — costs roughly the same in calendar time for 0.5.0 but adds 2-3 weeks of debt service in 0.6.0 and 0.7.0, plus blocks the SDK extraction indefinitely. The compounding does not favor it.

Final note: this document is itself part of the architecture. Once approved, it should be linked from `CLAUDE.md` (both packages), kept in `docs/architecture/` of the monorepo, and updated as the layers solidify. The codebase becomes harder to drift from a documented architecture than from an implicit one — and a documented relayer architecture is a prerequisite for the day a third-party team wants to integrate `@tezosx/relayer` into their own product.
