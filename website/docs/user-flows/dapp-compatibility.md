---
id: dapp-compatibility
title: dApp Compatibility
sidebar_position: 4
---

# dApp Compatibility

What an existing EVM dApp can and cannot do against the relayer's EIP-1193
surface, and how the main wallet-connection stacks discover it.

## What works structurally

These facts follow from the provider's code, independent of any specific dApp:

- **Read methods work.** `eth_chainId`, `net_version`, `eth_call`,
  `eth_getBalance` and `eth_getTransactionCount` are handled directly, and any
  unrecognized method is proxied verbatim to the EVM JSON-RPC. Balance
  displays, contract reads and history queries behave normally.
- **Fee estimation is constant by design.** `eth_estimateGas` answers a flat
  headroom figure (`0x1e8480`), `eth_gasPrice` and `eth_maxPriorityFeePerGas`
  answer `0x0`, and `eth_feeHistory` returns an all-zero series. A dApp
  computing cost as `gasLimit × gasPrice` reads zero EVM cost — correct,
  because the real fee is a mutez fee charged when the Michelson operation is
  signed. See [Gotchas](/docs/gotchas).
- **Writes go through an allow-list.** `eth_sendTransaction` supports bare
  native transfers (empty calldata) and contract calls whose 4-byte selector
  is on the relayer's curated allow-list (ERC-20 methods, the playground
  Counter, and a few common DeFi selectors). Any other selector is rejected
  with `-32602` before signing — see
  [Selector resolution](../architecture/nac-gateway#selector-resolution).
- **No signature methods.** `eth_sign`, `personal_sign` and
  `eth_signTypedData*` are rejected with EIP-1193 error `4200` — a tz1
  account cannot produce EVM signatures. Any dApp whose login requires SIWE
  (`personal_sign`) or whose UX requires typed-data signatures (EIP-2612
  `permit`, gasless orders) cannot complete that flow. See
  [RelayerProvider → Not supported](../sdk/provider#not-supported)
  and [Gotchas](/docs/gotchas).

## Tested dApps (at relayer 0.8.0)

| dApp | Status | Wallet mechanism | Notes |
|---|---|---|---|
| Tezos X EVM Faucet | ✅ Working | `window.ethereum` + EIP-6963 | Fully functional |
| IguanaDEX | ✅ Working | `window.ethereum` | Requires testnet mode enabled in IguanaDEX settings |
| Superlend | ✅ Working | wagmi | EIP-6963 |
| Uniswap | ❌ No testnet | — | No Tezos X Previewnet support |

Empirical results, observed at relayer 0.8.0 — a dApp's own releases can
change them either way. The structural rules above are the reliable predictor:
a dApp works if its reads go through standard JSON-RPC, its writes use
allow-listed selectors, and it never requires a message signature.

## Known limitations

**Coexisting with MetaMask (and other injected wallets)**
`window.ethereum` is a race in both directions. The relayer itself tries to
lock the property with `Object.defineProperty(window, 'ethereum', { value,
writable: false, configurable: false })`; if another extension locked it
first, it falls back to a plain assignment (which may fail silently) and logs
a console warning. MetaMask does the same in reverse. The coexistence
mechanism is **[EIP-6963](../architecture/eip6963)**: every installed wallet
announces its own identity regardless of who owns `window.ethereum`, so dApps
should discover providers via EIP-6963 and let the user pick. As a user-side
workaround, MetaMask can be disabled per-site from its extension menu.

A self-contained discovery helper (the relayer announces itself with
`rdns: 'com.tezosx.relayer'`; the Tezos X Wallet announces its own entry):

```ts
interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

interface Eip6963ProviderDetail {
  info: { uuid: string; name: string; rdns: string; icon: string };
  provider: Eip1193Provider;
}

function discoverProviders(waitMs = 300): Promise<Eip6963ProviderDetail[]> {
  return new Promise((resolve) => {
    const found: Eip6963ProviderDetail[] = [];
    const onAnnounce = (e: Event) => {
      const detail = (e as CustomEvent<Eip6963ProviderDetail>).detail;
      if (!found.some((p) => p.info.uuid === detail.info.uuid)) found.push(detail);
    };
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      const injected = (window as { ethereum?: Eip1193Provider }).ethereum;
      if (found.length === 0 && injected != null) {
        found.push({
          info: { uuid: 'window-ethereum', name: 'Browser wallet', rdns: 'window.ethereum', icon: '' },
          provider: injected,
        });
      }
      resolve(found);
    }, waitMs);
  });
}
```

**Injection vehicles**
The supported injected provider is the **Tezos X Wallet extension**, which
embeds the relayer around its own signer and approval flow. The relayer's own
MV3 extension (`packages/relayer/extension`, Temple-backed) is a superseded
proof of concept kept for reference. The IIFE bundle
(`dist/relayer.iife.js`, loaded via script tag) serves local development of
your own dApp; note that pages with a strict Content Security Policy block
Tampermonkey-style inline injection, which is one more reason userscripts are
testing-only. See the [legacy section of Installation](../installation#legacy-the-temple-backed-extension-poc-superseded).

**Message signing**
`personal_sign`, `eth_sign` and `eth_signTypedData*` are rejected with
EIP-1193 error `4200` — see the structural rules above. dApps whose login
flow requires SIWE cannot complete it through the relayer.

## WalletConnect

WalletConnect is supported as the pairing transport between a **page-side
dApp** and the **Tezos X mobile wallet**, with two hard constraints on the
dApp side. Use `@walletconnect/ethereum-provider` and initialise it exactly
like this:

```ts
import { EthereumProvider } from '@walletconnect/ethereum-provider';

const PREVIEWNET_CHAIN_ID = 128064; // eth_chainId = 0x1f440
const TEZLINK_EVM_RPC = 'https://evm.previewnet.tezosx.nomadic-labs.com';
const projectId = '<your Reown project id>';

const provider = await EthereumProvider.init({
  projectId,
  // Optional namespaces only: a `chains:` entry would land in
  // requiredNamespaces with the SDK's default required methods (including
  // personal_sign, which the wallet cannot offer for tz1 accounts) and the
  // settlement would fail on the dApp side. The settled session is the
  // intersection with what the wallet supports.
  optionalChains: [PREVIEWNET_CHAIN_ID],
  optionalMethods: ['eth_accounts', 'eth_sendTransaction'],
  optionalEvents: ['accountsChanged', 'chainChanged'],
  // Chain 128064 is not in Reown's Blockchain API, so the rpcMap is
  // mandatory — read methods are served by it, not by the wallet.
  rpcMap: { [PREVIEWNET_CHAIN_ID]: TEZLINK_EVM_RPC },
  showQrModal: false, // surface the wc: URI via the 'display_uri' event
  metadata: {
    name: 'My dApp',
    description: 'EIP-1193 dApp on Tezos X',
    url: window.location.origin,
    icons: [],
  },
});
```

Why both constraints are non-negotiable:

- **`optionalChains` only, never `chains`.** Required namespaces must be
  served in full or the session settlement fails, and the SDK's defaults for a
  required chain include `personal_sign` — which a tz1-backed wallet cannot
  offer. With optional namespaces, the settled session is the intersection of
  what you ask and what the wallet supports.
- **`rpcMap` is mandatory.** Chain `128064` is not in Reown's Blockchain API,
  so without an explicit RPC mapping every read method fails.

On the wallet side, the mobile wallet advertises exactly two methods on
`eip155:128064`: `eth_accounts` and `eth_sendTransaction`. Everything a
session needs beyond that (reads) comes from the `rpcMap`.

## Wallet detection by stack (at relayer 0.8.0)

| dApp stack | Detection method | Relayer visible |
|---|---|---|
| Raw `window.ethereum` | Direct property | ✅ (subject to the injection race above) |
| wagmi v1 | `window.ethereum` | ✅ |
| wagmi v2 + RainbowKit | EIP-6963 | ✅ |
| ConnectKit | EIP-6963 | ✅ |
| Privy | EIP-6963 | ✅ Detected as injected wallet (login flows that require message signing cannot complete — see above) |
| WalletConnect | Pairing protocol | ✅ Via `@walletconnect/ethereum-provider` with the constraints above |

## What to verify dApp-side

A short checklist when integrating:

- **Chain id** — assert `eth_chainId` returns `0x1f440` (128064) before
  enabling any action.
- **Fees** — treat `eth_estimateGas` as constant headroom and never display
  `gasLimit × gasPrice` as a fee (it is zero by design; the real fee is
  mutez-side).
- **Values** — align every `value` to a multiple of 10¹² wei using `BigInt`
  mutez math; see [Transfer → value encoding](./transfer#value-encoding).
- **Errors** — handle `4001` (user rejected), `4200` (unsupported method —
  the signature methods), and `-32602` (invalid params: unknown selector,
  sub-mutez value, invalid destination) as distinct cases, matching on the
  numeric `code`.
- **Receipts** — poll `eth_getTransactionReceipt` with the exact hash
  `eth_sendTransaction` returned. The provider transparently swaps the
  synthetic hash for the real kernel-synthesized one; never try to derive or
  await the real hash yourself.

## See also

- [EIP-6963 discovery](../architecture/eip6963) — how the relayer announces itself to wallet pickers
- [Connect Wallet](./connect-wallet) — the connection flow and its events
- [Gotchas](/docs/gotchas) — fee model, value alignment, unsupported methods
