---
id: wallet-clients
title: Wallet clients
---

# Wallet clients

The provider does not sign anything itself — it delegates every Michelson
operation to an **`ITezosWalletClient`**. That interface is the SDK's
extension point: `BeaconClient` (Temple) is the bundled adapter, and the
Tezos X Wallet demonstrates the other path with its own local signer.

## `ITezosWalletClient` — the contract

```ts
import type { ITezosWalletClient, WalletPermissions } from '@tezosx/relayer/wallet-client';

interface WalletPermissions { address: string; publicKey: string }

interface ITezosWalletClient {
  getActiveAccount(): Promise<WalletPermissions | null>;
  setAccountChangeHandler(cb: (tz1: string | null) => void): void;
  requestPermissions(): Promise<WalletPermissions>;
  sendContractCall(
    entrypoint:   string,                 // 'call' | 'call_evm'
    michelineArg: MichelsonV1Expression,  // built by the SDK
    mutezAmount?: string,
  ): Promise<string>;                     // → the Michelson operation hash ('o…')
  disconnect(): Promise<void>;
}
```

What each method must do:

- **`getActiveAccount`** — the already-connected account, or `null`. Called
  once at provider construction for the silent session restore.
- **`setAccountChangeHandler`** — push account switches to the provider; pass
  `null` when the user disconnects (the provider then emits
  `accountsChanged []` + `disconnect`).
- **`requestPermissions`** — prompt the user; reject with an error carrying
  **`code: 4001`** on user abort (the provider relies on that code to
  distinguish abandonment from failure).
- **`sendContractCall`** — sign and inject the Michelson operation the SDK
  built, against the NAC gateway, with the given mutez amount attached, and
  return the operation hash.
- **`disconnect`** — clear the wallet-side session.

## `BeaconClient` — the bundled Temple adapter

```ts
import { BeaconClient } from '@tezosx/relayer/tezos';
const client = new BeaconClient(); // no arguments
```

Everything is hard-coded — by design, it is the batteries-included path:

| Fixed | Value |
|---|---|
| dApp name shown in Temple | `Tezos X Relayer` |
| Network | Beacon `CUSTOM`, pointed at the Michelson runtime RPC (`TEZOS_L1_RPC`) |
| Operation ceilings | `fee: 100000` (0.1 ꜩ), `gas_limit: 1040000`, `storage_limit: 60000` — Temple re-estimates before signing |
| Destination | the NAC gateway contract |

`requestPermissions()` takes no arguments either. Errors: a user abort
surfaces as **`4001`**; any other Beacon failure as **`-32603`**.

If you need your own dApp name, network, or signing UI — implement
`ITezosWalletClient` instead. There is no configuration surface on
`BeaconClient`.

## Writing your own

The reference implementation is the Tezos X Wallet's `TezosSigner`
(`packages/core/src/adapters/tezos/tezos-signer.ts`): a Taquito
`InMemorySigner` wrapper where `getActiveAccount` / `requestPermissions`
return the local account without any prompt (the wallet runs its own approval
UI upstream), `setAccountChangeHandler` is a no-op (one provider per
account), and `sendContractCall` estimates fees via Taquito with a capped
retry on `tezlink_error`.

```ts
import { RelayerProvider } from '@tezosx/relayer/provider';

class MyWalletClient implements ITezosWalletClient {
  /* the 5 methods around your signer */
}

const provider = new RelayerProvider(new MyWalletClient(), myPendingOpsStore);
```

Note the `@tezosx/relayer/provider` deep import: it pulls `RelayerProvider`
alone, without the `/tezos` barrel's Beacon dependency — the right form when
your client replaces Beacon entirely.
