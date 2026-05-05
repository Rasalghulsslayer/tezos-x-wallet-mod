---
id: local-signer
title: Local Signer
sidebar_label: Local Signer
---

# Local Signer

`LocalSignerClient` ([`packages/wallet/src/background/signer.ts`](https://github.com/trilitech/tezos-x-wallet/blob/main/packages/wallet/src/background/signer.ts)) is the wallet's implementation of `ITezosWalletClient`. It signs Tezos L1 operations locally using a secret key held in service worker memory — no Temple or Beacon SDK required.

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
  ): Promise<string>;   // returns Tezos L1 opHash
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

Internally it initialises a Taquito `TezosToolkit` pointed at the Tezos X testnet RPC, and registers an `InMemorySigner` with the secret key:

```ts
this.toolkit = new TezosToolkit(TEZOS_L1_RPC);
this.toolkit.setProvider({ signer: new InMemorySigner(secretKey) });
```

## `sendContractCall`

When `RelayerProvider` needs to send an operation (e.g. for `eth_sendTransaction`), it calls:

```ts
signer.sendContractCall(entrypoint, michelineArg, mutezAmount)
```

This submits a `TRANSACTION` operation to the **NAC gateway contract** (`KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw`) using Taquito's `contract.transfer`:

```ts
const op = await this.toolkit.contract.transfer({
  to:        NAC_CONTRACT,
  amount:    Number(mutezAmount),
  mutez:     true,
  parameter: { entrypoint, value: michelineArg },
});
return op.hash;   // Tezos L1 opHash (Base58Check)
```

Taquito handles fee estimation, gas and storage limit simulation, and signature injection automatically.

## Comparison with `BeaconClient`

| Aspect | `LocalSignerClient` | `BeaconClient` |
|---|---|---|
| **Key location** | SW memory (from keyring) | Temple Wallet |
| **Temple required** | No | Yes |
| **Signing popup** | None | Temple popup |
| **Fee estimation** | Taquito (automatic) | Beacon / Temple |
| **Used by** | TezosX Wallet extension | TezosX Relayer extension |
| **`disconnect()`** | No-op (keyring handles lock) | Clears Beacon active account |

## Lifecycle

`LocalSignerClient` is stateless beyond its constructor arguments. It is recreated every time the wallet unlocks:

```
keyring.unlock() → new LocalSignerClient(sk, pk, tz1) → new RelayerProvider(signer)
```

When the wallet locks, `provider = null` discards the instance. The secret key is no longer accessible until the next unlock.
