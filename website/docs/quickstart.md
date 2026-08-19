---
id: quickstart
title: Quickstart
---

# Quickstart

Your dApp embeds the SDK, constructs the provider once, and talks standard
[EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) to it. Temple opens via
Beacon when the user connects; the transaction executes on the EVM runtime,
signed by the user's tz1.

*(The package is not on npm — see [Installation](./installation) for how to
depend on it.)*

```ts
import { RelayerProvider, BeaconClient } from '@tezosx/relayer/tezos';

const provider = new RelayerProvider(new BeaconClient());

// Connect — Temple opens; returns the 0x alias of the user's tz1.
const [evmAlias] = (await provider.request({ method: 'eth_requestAccounts' })) as string[];

// Send — 1 XTZ to an EVM address.
const hash = (await provider.request({
  method: 'eth_sendTransaction',
  params: [{
    to:    '0x1a2B3c4D5e6F70819293A4B5c6D7E8F901234567',
    value: '0xde0b6b3a7640000', // 1 XTZ
  }],
})) as string;

// Standard EIP-1193 from here — poll the receipt with the hash you got.
const receipt = await provider.request({
  method: 'eth_getTransactionReceipt',
  params: [hash],
});
```

That is the whole integration. Reads (`eth_call`, `eth_getBalance`,
`eth_blockNumber`, …) go through the same `provider.request()`; anything the
provider doesn't handle itself is proxied to the EVM node, which keeps
ethers.js / viem / wagmi working on top of it.

Four things to know before shipping:

- **`value` must be a whole number of mutez** — a multiple of 10¹² wei
  (1 XTZ = 10¹⁸ wei is fine; 500 wei is rejected with `-32602`).
  [Why →](./gotchas#fees-and-gas)
- **Catch `4001`** — the user closing the Temple prompt is abandonment, not a
  failure to surface. All codes: [error codes](./sdk/provider#error-codes).
- **The hash you get back is synthetic** (derived from the Michelson
  operation hash). You don't have to care: `eth_getTransactionByHash` and
  `eth_getTransactionReceipt` handle the swap to the real transaction
  transparently. [Why →](./gotchas#the-synthetic-transaction-hash)
- **Pass a `PendingOpsStore`** as the provider's second argument if your page
  can reload while a transaction is pending — without it, the synthetic→real
  resolution state dies with the page.
  [The contract →](./sdk/provider#the-pendingopsstore-contract)

## Where to go next

- **Everything the SDK contains** — the [SDK section](./sdk/overview): the
  provider in full, wallet clients (Beacon or your own signer), the
  cross-runtime builders for both directions, constants and types.
- **Building a wallet, not a dApp?** Implement
  [`ITezosWalletClient`](./sdk/wallet-clients) around your own signer —
  Temple/Beacon is just the bundled adapter.
- **Your page would rather use the wallet the user already has?** Discover
  the injected provider instead of embedding the SDK —
  [dApp compatibility](./user-flows/dapp-compatibility).
- **Something looks broken?** It's probably one of the four
  [surprising behaviors](./gotchas).
