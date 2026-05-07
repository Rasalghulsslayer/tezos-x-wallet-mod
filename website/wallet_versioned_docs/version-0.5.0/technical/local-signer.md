---
id: local-signer
title: Local Signer
sidebar_label: Local Signer
---

# Local Signer

`LocalSignerClient` ([`packages/wallet/src/background/signer.ts`](https://github.com/trilitech/tezos-x-wallet/blob/main/packages/wallet/src/background/signer.ts)) is the wallet's implementation of `ITezosWalletClient`. It signs Michelson runtime operations locally using a secret key held in service worker memory — no Temple or Beacon SDK required.

## Interface

`LocalSignerClient` implements [`ITezosWalletClient`](https://github.com/trilitech/tezos-x-wallet/blob/main/packages/relayer/src/wallet-client.ts):

```ts
interface ITezosWalletClient {
  getActiveAccount(): Promise<WalletPermissions | null>;
  setAccountChangeHandler(cb: (tz1: string | null) => void): void;
  requestPermissions(): Promise<WalletPermissions>;
  sendContractCall(
    entrypoint: string,
    michelineArg: MichelsonV1Expression,
    mutezAmount?: string,
  ): Promise<string>;   // returns Michelson runtime opHash
  disconnect(): Promise<void>;
}
```

## Construction

The service worker creates a `LocalSignerClient` from the unlocked identity immediately after `keyring.unlock()`:

```ts
const signer = new LocalSignerClient(
  unlocked.secretKey,    // edsk…
  unlocked.publicKey,    // edpk…
  unlocked.tz1,          // tz1…
);
provider = new RelayerProvider(signer);
```

Internally it initialises a Taquito `TezosToolkit` pointed at the Tezos X Previewnet RPC, and registers an `InMemorySigner` with the secret key:

```ts
this.toolkit = new TezosToolkit(TEZOS_L1_RPC);
this.toolkit.setProvider({ signer: new InMemorySigner(secretKey) });
```

## `sendContractCall`

When `RelayerProvider` needs to send an operation (e.g. for `eth_sendTransaction`), it calls:

```ts
signer.sendContractCall(entrypoint, michelineArg, mutezAmount)
```

This submits a `TRANSACTION` operation to the **NAC gateway contract** (`KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw`) through the internal `transferWithKernelAwareFees` wrapper (see [Fees — kernel-aware](#fees--kernel-aware)):

```ts
return this.transferWithKernelAwareFees({
  to:        NAC_CONTRACT,
  amount:    Number(mutezAmount),
  mutez:     true,
  parameter: { entrypoint, value: michelineArg },
});
```

The wrapper handles fee computation against the live kernel constants; Taquito still handles forging, simulation, and signature injection.

## `sendNativeTransfer`

For **same-runtime XTZ transfers** (`tz1 → tz1 / KT1`), routing through the gateway would be wasteful — the NAC contract would just receive mutez from the source and forward them to the destination, with no EVM state ever touched. The wallet bypasses the gateway in that case and calls a plain Michelson runtime transfer directly:

```ts
signer.sendNativeTransfer(to, mutezAmount)
```

```ts
return this.transferWithKernelAwareFees({
  to,                       // tz1 / tz2 / tz3 / KT1
  amount: Number(mutezAmount),
  mutez:  true,
});
```

The decision is made in the service worker's `SEND_TX` handler based on `detectRuntime(msg.to)`:

| asset | recipient runtime | path |
|---|---|---|
| `XTZ`  | `l1` (`tz1 / KT1 / …`) | `sendNativeTransfer` (no gateway) |
| `XTZ`  | `l2` (`0x…`) | `RelayerProvider.request('eth_sendTransaction')` → `sendContractCall('default', …)` |
| `USDC` | `l2` (`0x…`) | `RelayerProvider.request('eth_sendTransaction')` → `sendContractCall('call_evm', …)` |

`sendNativeTransfer` is a wallet-only addition; it lives on `LocalSignerClient` but is **not** part of the `ITezosWalletClient` interface — the relayer never needs to know about same-runtime shortcuts since it always targets EVM state.

## Fees — kernel-aware

### Why this is non-trivial

The Tezos fee formula a node enforces is:

```
fee ≥ minimal_fees + ⌈gas_limit × per_gas / 1000⌉ + ⌈op_size × per_byte / 1000⌉   (mutez)
```

The three constants (`minimal_fees`, `per_gas`, `per_byte`) are part of the **node's mempool filter configuration**, not protocol-level constants. Tezos mainnet ships them as `(100, 0.1, 1)` (mutez per gas, mutez per byte). Taquito hardcodes those mainnet values in its auto-fee estimator.

The TezosX kernel uses a **different schedule** — gas is roughly 100× cheaper, bytes are 4000× more expensive. With Taquito's hardcoded constants, the suggested fee under-shoots reality by 10–25 % and the kernel rejects with `evm_node.dev.insufficient_fees`. **No multiplier on the wrong base formula reproduces the kernel's exact value** — both the byte and gas terms diverge in opposite directions, and any flat buffer that's safe in one direction over-pays in the other.

This is the same problem the `octez-client` team solved in MRs !21028, !21050, !21155, !21199 — by reading constants live from the node and computing the exact value.

### Resolution

`LocalSignerClient` adopts the same approach. The wrapper `transferWithKernelAwareFees` (used by both `sendContractCall` and `sendNativeTransfer`):

1. **Pre-estimates** the operation via `toolkit.estimate.transfer` to get `gasLimit`, `storageLimit`, and `opSize` — Taquito's simulation is correct on those numbers; only the *fee* it derives from them is wrong.
2. **Fetches live constants** from the kernel's RPC `chains/main/mempool/filter` (cached 30 s, in-memory):

   ```json
   {
     "minimal_fees": "100",
     "minimal_nanotez_per_gas_unit": ["10", "1"],
     "minimal_nanotez_per_byte":     ["4000", "1"]
   }
   ```

   The two `nanotez_per_*` values are returned as **Q-rationals** (`[numerator, denominator]`); the formula is in nanotez, mutez = nanotez / 1000.

3. **Pads `opSize` by 96 bytes** before computing the fee. Taquito's `est.opSize` measures the *forged, unsigned* operation — but at injection time a 64-byte Ed25519 signature is prepended, and zarith encoding of fee/gas/storage can shift by a few bytes when we override Taquito's suggested values. Without this margin the kernel charges per-byte on the signed op while we pay for the unsigned size, causing under-payment. The 96-byte margin (64 sig + 32 cushion) keeps the first submission accepted; over-payment is bounded at ~400 mutez (~0.0004 tez), negligible.
4. **Computes the kernel-exact fee** using BigInt arithmetic, rounding each term up:

   ```ts
   fee = minimalFees
       + ⌈gasLimit × num_g / (1000 × den_g)⌉
       + ⌈(opSize + 96) × num_b / (1000 × den_b)⌉
   ```

5. **Submits** with that exact fee, the unmodified `gasLimit`, and `storageLimit + 1`.

6. **Retries on residual rejection.** If the kernel still returns `insufficient_fees`, the error's `required` field is parsed and the op is resubmitted once with that exact value. The parser scans both the structured `errors` array and the raw `message`, and handles both mutez-integer and JSON-quoted decimal-tez formats (the latter is what the Tezos node actually returns). Without dual-format handling the retry silently no-ops; with it, the 96-byte margin and this safety net together cover the long tail.

### Cache invalidation

The 30 s TTL is a tradeoff: kernel constants change rarely (only on a node-side filter config update), but caching forever risks stale data after a redeploy. 30 s keeps fee-fetch overhead negligible (~one fetch per session burst of sends) without drifting more than a few seconds behind reality.

## Comparison with `BeaconClient`

| Aspect | `LocalSignerClient` | `BeaconClient` |
|---|---|---|
| **Key location** | SW memory (from keyring) | Temple Wallet |
| **Temple required** | No | Yes |
| **Signing popup** | None | Temple popup |
| **Fee estimation** | Kernel-aware (`mempool/filter` RPC + Taquito gas/storage estimate) | Beacon / Temple |
| **Used by** | TezosX Wallet extension | TezosX Relayer extension |
| **`disconnect()`** | No-op (keyring handles lock) | Clears Beacon active account |

## Lifecycle

`LocalSignerClient` is stateless beyond its constructor arguments. It is recreated every time the wallet unlocks:

```
keyring.unlock() → new LocalSignerClient(sk, pk, tz1) → new RelayerProvider(signer)
```

When the wallet locks, `provider = null` discards the instance. The secret key is no longer accessible until the next unlock.
