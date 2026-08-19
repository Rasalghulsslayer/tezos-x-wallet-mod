---
id: gotchas
title: Surprising behaviors
---

# Surprising behaviors

Four behaviors of the tz1-backed provider that look like bugs the first time you meet them. Each section covers what you observe, why it is so, and what to do about it.

## The synthetic transaction hash {#the-synthetic-transaction-hash}

**What you observe.** `eth_sendTransaction` resolves with a 32-byte hash almost immediately after the user signs — but the EVM explorer doesn't know it, `eth_getTransactionReceipt` returns `null`, and `eth_getTransactionByHash` returns a transaction stuck in "pending".

**Why.** What the user actually signed is a Michelson operation against the NAC gateway contract, identified by a base58 operation hash (`o…`). The Tezos X kernel then executes the call on the EVM runtime and synthesizes a real EVM transaction — whose hash cannot be known at submission time. So the provider returns a **synthetic** hash right away: the keccak256 of the operation-hash string (`l1OpHashToEvmHash`). It then resolves the real hash by scanning EVM blocks from a head snapshot taken just before submission, looking for the transaction bound to the sender's alias (and, for bookkeeping shapes, for a receipt log emitted by the NAC precompile).

While the real hash is unresolved, the provider keeps standard tooling alive:

- `eth_getTransactionByHash` on a tracked synthetic hash returns a **synthesized pending-transaction object** (`blockNumber: null`), never `null`. Per EIP-1474 a submitted-but-unmined transaction is "pending"; returning `null` would mean "unknown hash" and make ethers/viem pollers (`tx.wait()`) abort or throw.
- `eth_getTransactionReceipt` returns `null` (the spec's answer for not-yet-mined), then — once resolved — transparently swaps in the real hash and serves the real receipt. You never have to know the swap happened.

Resolution is bounded: each `resolveSyntheticHash` call makes up to 15 attempts, 2 s apart (each attempt rescans from the snapshot block to the current head), then resolves to `null`. It can exhaust — typically when the kernel emitted a shape the scanner had to reject, or the node lags.

**What to do.** As a dApp, poll `eth_getTransactionReceipt` as you would anywhere. As a wallet, call `provider.resolveSyntheticHash(hash)` and only show "Done" with the real hash; if it keeps returning `null` after a minute or so, give up gracefully — keep displaying the synthetic hash, fetch the operation hash with `provider.getPendingL1Hash(hash)`, and link the user to the operation on TzKT (`https://previewnet.tezosx.tzkt.io`) instead. Pass a `PendingOpsStore` to the provider constructor so this whole state survives a reload; `provider.listPendingOps()` lists what is still unresolved.

## EVM signature methods are rejected with 4200 {#evm-signature-methods-are-rejected-with-4200}

**What you observe.** `eth_sign`, `personal_sign`, and `eth_signTypedData` / `_v3` / `_v4` throw error `4200` (`… is not supported by the Tezos X Relayer`) without ever prompting the user.

**Why.** The user's `0x` address is a kernel **mapping** of their tz1 — it is not derived from a secp256k1 public key, because there is no secp256k1 key. EVM signature verification is recovery-based: `ecrecover` derives a signer address *from the signature* and compares it to the claimed address. A tz1's Ed25519 key cannot produce a secp256k1 signature that recovers to the alias. This is not a missing feature — it is structurally impossible — so the relayer refuses upfront rather than prompting the user for a signature that could never verify.

**Consequences.** No Sign-In-with-Ethereum (SIWE), no EIP-2612 `permit`, no off-chain typed-data orders — anything whose verification path is `ecrecover` is out.

**What to do.** For authentication, establish a server-side session from the `eth_requestAccounts` result — knowing which account the wallet reports is enough for many flows, but note it is not cryptographic proof of key ownership. When you need proof, move it to the Michelson side out of band: have the user sign a challenge with their tz1 key (Ed25519) and verify it server-side against the tz1 that maps to the alias (`resolveTezosAddress` gives you the reverse mapping). For token allowances, use an on-chain `approve()` transaction instead of `permit` — `approve` is on the provider's selector allow-list.

## Native XTZ and the alias forwarder {#native-xtz-and-the-alias-forwarder}

**What you observe.** The alias's native balance reads ~0 — even immediately after someone sends XTZ to it. The explorer shows a puzzling self-transfer bookkeeping entry around cross-runtime operations.

**Why.** EVM aliases of Tezos accounts **cannot hold native XTZ**. The kernel forwards any native XTZ sent to an alias straight back to the origin tz1. The forwarding shows up on explorers as a bookkeeping entry (the Tezos X Wallet filters it out of its activity feed).

**Consequences.** A native transfer to someone's alias effectively credits their tz1 — the money is not lost, it just never rests on the `0x` side. And `eth_getBalance(alias)` is ~0 *by design*, not because the account is empty.

**ERC-20s are different.** Token balances live in the token contract's storage, and the alias really holds them: `balanceOf(alias)` is meaningful, transfers to the alias stay on the alias, and wallets display them. The asymmetry is native-XTZ-only.

**What to do.** Don't build UI that reads the native balance of a Tezos user's alias — it will always show ~0 and confuse people; if you need their spendable balance, it is the tz1's balance on the Michelson runtime. Paying a Tezos user by sending native XTZ to their alias does work (the tz1 gets credited). For value that must live and compose on the EVM side, use ERC-20 tokens.

## Fees and gas {#fees-and-gas}

**What you observe.** `eth_estimateGas` always returns `0x1e8480` (2,000,000). `eth_gasPrice` and `eth_maxPriorityFeePerGas` return `0x0`. `eth_feeHistory` returns an all-zero series. A `gas` field passed to `eth_sendTransaction` is ignored.

**Why.** A tz1-source transaction is not paid for in EVM gas: it executes as a Michelson operation whose real cost is the **mutez fee**, computed and charged when the wallet signs (the bundled `BeaconClient` submits with fee/gas/storage ceilings that Temple re-estimates). There is no EVM gas market to sample, so the provider answers with constants that keep dApp fee math well-defined: the flat 2,000,000 estimate passes gas-limit checks (it is headroom, not consumption); `gasLimit × gasPrice = 0` correctly reports zero EVM-side cost; and the fee-history series is shaped so code that averages historical fees doesn't divide by zero.

**The mutez alignment rule.** The Michelson runtime denominates value in mutez (10^-6 XTZ), and 1 mutez = 10^12 wei. A `value` with a sub-mutez remainder would be silently floored away, so the provider rejects it at build time (`SubMutezPrecisionError` → `-32602`):

| `value` (wei) | XTZ | Result |
|---|---|---|
| `0xe8d4a51000` (10^12) | 0.000001 (1 mutez) | accepted |
| `0xde0b6b3a7640000` (10^18) | 1 | accepted |
| `0x14d1120d7b160000` (1.5 × 10^18) | 1.5 | accepted |
| `0x1f4` (500) | — | rejected — below 1 mutez |
| `0xe8d4a51001` (10^12 + 1) | — | rejected — 1 wei would be lost |

The conversion rule is exported as `weiToMutezExact(wei)` so your own transfer paths can enforce the same no-silent-loss check.

**The other direction has real gas.** When an EVM-native account calls Michelson through the NAC precompile (the `/evm` builders), the sub-call does consume gas — allocate `NAC_RECOMMENDED_GAS`: 3,000,000 for the generic `call`, 5,000,000 for `callMichelson`.

**Read deadlines (0.8.0).** Read calls through the provider carry a 15 s deadline (`RPC_TIMEOUT_MS`). A timeout throws a **plain `Error`** — `Request timed out after 15000ms calling <method>` — deliberately without an EIP-1193 code: a timeout is not a transport loss, and it should route to retry logic, not disconnect handling. An actual fetch failure or non-2xx response throws with code `4900`. The raw passthrough for unknown methods opts out of the deadline, because it may carry writes and aborting after a broadcast is worse than waiting.
