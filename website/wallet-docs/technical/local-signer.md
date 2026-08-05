---
id: local-signer
title: Local signing (TezosSigner)
sidebar_label: Local Signing
---

# Local signing (`TezosSigner`)

`TezosSigner` ([`packages/core/src/adapters/tezos/tezos-signer.ts`](https://github.com/trilitech/tezos-x-wallet/blob/main/packages/core/src/adapters/tezos/tezos-signer.ts)) is the Tezos-account implementation of `TezosSignerPort`. It signs Michelson runtime operations locally with a secret key held in service-worker memory — no Temple or Beacon SDK involved. It lives in `@tezosx/wallet-core`, so the same signer serves both the extension and the mobile app.

## Interface

`TezosSignerPort` extends the relayer's [`ITezosWalletClient`](https://github.com/trilitech/tezos-x-wallet/blob/main/packages/relayer/src/ports/tezos-wallet-client.ts) with a same-runtime shortcut:

```ts
interface TezosSignerPort extends ITezosWalletClient {
  readonly kind:    'tezos';
  readonly account: TezosAccount;
  sendNativeTransfer(to: string, mutezAmount: string): Promise<string>;
}

interface ITezosWalletClient {
  getActiveAccount(): Promise<WalletPermissions | null>;
  setAccountChangeHandler(cb: (tz1: string | null) => void): void;
  requestPermissions(): Promise<WalletPermissions>;
  sendContractCall(
    entrypoint:   string,
    michelineArg: MichelsonV1Expression,
    mutezAmount?: string,
  ): Promise<string>;   // returns the Michelson operation hash
  disconnect(): Promise<void>;
}
```

`sendNativeTransfer` is deliberately **not** part of `ITezosWalletClient` — the relayer always targets EVM state, so it never needs the same-runtime shortcut.

## Construction

The signer is wired per account by the core container (see the [Architecture Overview](../architecture/overview.md)). When a container is needed for an account, the keyring derives the signing key on demand — the unlocked keyring retains no signing keys — and `buildContainer` instantiates the adapter set for the account's kind:

```ts
const { account, secretKey } = await keyring.getSigningKeyFor(accountId);
// … inside buildContainer, for a Tezos account:
const signer   = new TezosSigner(account, secretKey);
const provider = new RelayerProvider(signer, pendingOpsStore);
```

Internally the signer initialises a Taquito `TezosToolkit` pointed at the Tezos X Previewnet Michelson RPC, and registers an `InMemorySigner` with the secret key:

```ts
this.toolkit = new TezosToolkit(TEZOS_L1_RPC);
this.toolkit.setProvider({ signer: new InMemorySigner(secretKey) });
```

## Routing

The transfer use case (`send-transfer` + `decideRoute`) picks the path from the source account kind and the destination address runtime. For a Tezos account:

| Asset | Destination | Path |
|---|---|---|
| XTZ | `tz1` / `KT1` (Michelson runtime) | Same-runtime — `sendNativeTransfer` (plain Michelson transfer, no gateway) |
| XTZ | `0x…` (EVM runtime) | Cross-runtime — `eth_sendTransaction` through `RelayerProvider` → gateway entrypoint `call` |
| ERC-20 (e.g. USDC) | `0x…` (EVM runtime) | Cross-runtime — `eth_sendTransaction` with `transfer(to, amount)` calldata → gateway entrypoint `call_evm` |

For a **bare native transfer** the relayer builds a generic `%call` HTTP request — `pair url (pair headers (pair body (pair method callback)))` — as a POST to `http://ethereum/<0x recipient>` with empty headers and body, the operation's mutez amount attached, and no callback. (The dedicated `%default` bare-transfer entrypoint was removed upstream; `%call` is its replacement.) ABI-encoded EVM calls go through `call_evm`, with the method signature resolved from the relayer's local selector allow-list.

## `sendContractCall`

Submits a `TRANSACTION` operation to the **NAC gateway contract** (`KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw`) through the internal `transferWithBufferedFees` wrapper (see [Fees](#fees)):

```ts
return this.transferWithBufferedFees({
  to:        NAC_CONTRACT,
  amount:    Number(mutezAmount),
  mutez:     true,
  parameter: { entrypoint, value: michelineArg },
});
```

Taquito handles forging, simulation, and signature injection.

## `sendNativeTransfer`

For **same-runtime XTZ transfers** (`tz1 → tz1 / KT1`), routing through the gateway would be wasteful — the NAC contract would just receive mutez from the source and forward them to the destination, with no EVM state ever touched. The wallet bypasses the gateway and issues a plain Michelson runtime transfer:

```ts
return this.transferWithBufferedFees({
  to,                       // tz1 / tz2 / tz3 / KT1
  amount: Number(mutezAmount),
  mutez:  true,
});
```

## Fees

### Why Tezos X fees differ from mainnet

The fee schedule the Tezos X kernel enforces — a dynamic, congestion-based gas price plus a data-availability byte fee, served by the node's `mempool/filter` endpoint — differs from Tezos mainnet's. Older Taquito releases hardcoded the mainnet constants in their fee estimator, so the suggested fee under-shot and the kernel rejected operations with `insufficient_fees`; earlier wallet versions worked around this by fetching the filter constants themselves and recomputing the fee. **Taquito ≥ 24.3 derives `suggestedFeeMutez` from the live `mempool/filter` schedule on every estimate**, so the estimate is kernel-correct out of the box and the hand-rolled fee computation is gone.

### Current model — `transferWithBufferedFees`

1. **Estimate** via `toolkit.estimate.transfer(params)`. `suggestedFeeMutez` is already kernel-correct (see above).
2. **Volatility buffer**: submit with `fee = ⌈suggestedFeeMutez × 1.5⌉` (`FEE_BUFFER`). The gas price is congestion-based and can rise between estimation and inclusion; the gas and storage *limits* are deterministic, so they are left as estimated (`storageLimit + 1` for a one-byte margin).
3. **One capped retry**: if the node still rejects with `insufficient_fees`, the `required` value is parsed out of the error (both the mutez-integer and the JSON-quoted decimal-tez formats are handled) and the operation is resubmitted **once** with exactly that fee — but only when `required ≤ computed × 4` (`MAX_RETRY_FEE_MULTIPLE`). The retry trusts a node-reported number, and a buggy or hostile RPC could otherwise name an absurd figure and drain the balance in fees; past the cap the original rejection is surfaced instead.

### `call_evm` fallback — fixed ceilings

Tezlink's `run_operation` can reject the *simulation* of a `call_evm` operation with `tezlink_error` when the default gas budgets are too low for the EVM sub-call. In that case the signer bypasses estimation entirely and submits with fixed Beacon-style ceilings, letting the kernel allocate what the sub-call needs:

| Parameter | Value |
|---|---|
| `gasLimit` | 1,040,000 |
| `storageLimit` | 60,000 |
| `fee` | 100,000 mutez |

This fallback applies only to `call_evm`; every other operation goes through the buffered-fee path above.

## Lifecycle

`TezosSigner` is stateless beyond its constructor arguments. Containers (signer + provider + fetchers) are cached per account and rebuilt on demand after unlock or an account switch. On lock — manual, auto-lock, or service-worker death — the container cache is cleared and the keyring wipes its vault key; the signing key is unreachable until the next unlock.

## Comparison with `BeaconClient`

| Aspect | `TezosSigner` | `BeaconClient` |
|---|---|---|
| **Key location** | Service-worker memory (derived on demand from the vault) | Temple Wallet |
| **Temple required** | No | Yes |
| **Signing popup** | None (the wallet's own approval flow gates dApp requests) | Temple popup |
| **Fee estimation** | Taquito live estimate × 1.5 buffer + one capped retry | Beacon / Temple |
| **Used by** | TezosX Wallet (extension and mobile, via `@tezosx/wallet-core`) | TezosX Relayer extension (Temple/Beacon integration) |
| **`disconnect()`** | No-op (the keyring owns lock) | Clears the Beacon active account |
