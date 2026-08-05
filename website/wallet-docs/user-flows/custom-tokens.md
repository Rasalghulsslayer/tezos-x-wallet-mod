---
id: custom-tokens
title: Custom ERC-20 tokens
sidebar_label: Custom tokens
---

# Custom ERC-20 tokens

Since **wallet 0.10.0** the wallet acknowledges arbitrary ERC-20 tokens deployed on the Tezos X EVM runtime. Up to `MAX_TOKENS_PER_ACCOUNT = 30` per account, persisted per-account in `chrome.storage.local` under `customTokens:<chainId>:<accountId>`. Once registered, a token renders identically to USDC and XTZ across Home, Send, and Activity.

USDC is itself a registered token — it is **default-seeded** into every account's registry at unlock and on every new account creation. The Remove button on the USDC row is disabled (builtin tokens cannot be removed).

## Adding a token

From **Home** tap the **Add token** affordance at the bottom of the assets list, or go through **Settings → Manage tokens**. Both routes open the three-stage flow at `/tokens/add`:

1. **Paste** the 0x contract address. The field is mono with a live byte counter. Validation is shape-first (`/^0x[0-9a-fA-F]{40}$/`) before any network call; an invalid value surfaces an inline error after blur.
2. **Confirm metadata.** The wallet reads `symbol()` / `decimals()` / `name()` via three `eth_call`s in `Promise.allSettled` against the Tezlink EVM RPC. The confirm screen shows the symbol prominently, the name below in muted, the truncated contract address below that in mono, and a seamed metadata card where **decimals carries the most visual weight** because it is the only field that can silently corrupt a balance.
3. **Submit.** Tap *Add `{symbol}`* to commit the token to the active account's registry. Tap *Cancel* to abort — **the token is not persisted until Submit**; the confirm preview is a peek, not a write.

The whole flow is wired in cyan because ERC-20s are EVM-runtime objects: the runtime chip on the paste screen, the asset mark's inset, the metadata card's top-seam, the input focus ring, and the primary CTA.

## Try anyway path

If the contract does not respond to `decimals()` (the load-bearing call — a contract that rejects it is not an ERC-20 in any practical sense), the paste stage surfaces an `ErrorCard` with the title "This contract doesn't look like an ERC-20" plus a bordered **Try anyway** button below. Engaging it re-runs the peek with `tryAnyway: true`; the wallet then defaults to 18 decimals, a truncated-address symbol, and the name "Unknown token", and the confirm screen surfaces a non-dismissable yellow band above the metadata:

> **Balances may display incorrectly.** The wallet defaulted to 18 decimals because the contract didn't respond cleanly. Verify the actual decimals on the contract before sending — a mismatch will show balances 10ᴺ too high or too low.

The band ships with a *Verify on Blockscout* deep-link so the user can confirm the actual decimals on chain before committing. The decimals row in the metadata card is tagged with an "assumed" pill in warning yellow, typographically linked to the band — they share the same colour and reference the same value.

## Removing a token

**Settings → Manage tokens** lists every registered token for the active account. Each row carries a Remove button. Tapping it on a user-added token fires `REMOVE_CUSTOM_TOKEN`; the wallet rebuilds the active container so the Activity fetcher's `tokenList` closure picks up the new registry on the next poll. The token disappears from Home and stops surfacing in Activity.

The Remove button is **disabled for builtin tokens** (currently just USDC). Manually editing `chrome.storage.local` to clear the registry re-seeds USDC on the next unlock — the wallet platform always wants USDC visible.

## Per-account registry

Tokens are scoped per-account, not per-vault. Adding token X on account 1 does **not** make it visible on account 2. This matches the AccountId-as-UUID model from 0.9.0: each account is independent, with its own balances, its own activity, its own preferences. USDC seeds into every account regardless of when the account was created.

## Sending a custom token

Send → asset selector iterates `[xtz, ...registeredTokens]`. Picking a custom token loads its balance via `eth_call(balanceOf(holder))` against the contract; the available row uses `formatTokenAmount(rawHex, asset.decimals)` with the decimals read from the registry entry (no more hardcoded 6).

Routing rules generalise: **an ERC-20 cannot target a Michelson-runtime destination** (no `tz1`, `tz2`, `tz3`, `KT1`). The `RoutingCard` block flips to warning yellow with the copy "`{symbol}` only exists on the EVM runtime — enter a 0x address." For Tezos-source accounts, the cross-runtime path routes through the NAC gateway's `call_evm` entrypoint, signing a real `transfer(address,uint256)` call to the token contract (see [Send XTZ](./send-xtz)); for EVM-source accounts, ERC-20 sends are deferred to a follow-up release (the asset selector disables non-XTZ assets for EVM accounts).

## Activity feed

The Activity feed decodes ERC-20 Transfer logs. `EvmActivityFetcher` queries Blockscout's `tokentx` endpoint and filters by the per-account registry; each Transfer event projects into an `ActivityTransferItem` with the right symbol, decimals, runtime tag, direction (`sent` / `received` based on `from`/`to` match), and an id keyed on the tx hash plus log index so dedup across paginations works. USDC transfers appear in the Activity feed since 0.10.0.

## Architecture

The token registry lives in a single port (`TokenStore`, `packages/core/src/ports/token-store.ts`) with a `ChromeTokenStore` adapter persisting per-account under `customTokens:<chainId>:<accountId>`. Three use cases (all under `packages/core/src/use-cases/`) drive the flow:

- **`peekCustomToken`** (read-only) — validates the address, checks for duplicates against the active account's registry, runs the `fetchErc20Metadata` helper, returns the prospective `RegisteredToken` without writing. Used by the confirm stage's preview.
- **`addCustomToken`** (write) — same validation + metadata fetch, plus the `tokenStore.upsert`. Used by the confirm stage's Submit. The SW dispatch rebuilds the container after every `ADD_CUSTOM_TOKEN` so `EvmActivityFetcher`'s `tokenList` closure picks up the new entry on the next poll.
- **`removeCustomToken`** — guards against removing builtin tokens (`BuiltinTokenError`), then `tokenStore.remove`. SW rebuilds the container.

The metadata helper `fetchErc20Metadata` lives in `packages/core/src/shared/erc20-metadata.ts`. It fires three `eth_call`s in `Promise.allSettled` with a 5 s timeout per call (`TOKEN_METADATA_TIMEOUT_MS`), handles both `string` and `bytes32` encodings for `symbol()` / `name()` (the old MakerDAO pattern is preserved), falls back gracefully when `symbol()` or `name()` fail, and throws `NotErc20Error` when `decimals()` rejects.

## Storage

```json
{
  "customTokens:128064:7e1a8b3c-9d4f-4c2e-b6a1-5f3d8e2c1b9a": [
    {
      "address":  "0xd77420f73b4612a7a99dba8c2afd30a1886b0344",
      "symbol":   "USDC",
      "name":     "USD Coin",
      "decimals": 6,
      "addedAt":  1717286400000,
      "builtin":  true
    }
  ]
}
```

The `chainId` is pinned to `128064` (Tezos X Previewnet) but lives in the key for forward-compatibility with future networks.

## Limits

`MAX_TOKENS_PER_ACCOUNT = 30`. Adding a 31st token surfaces `MaxTokensReachedError` on the paste stage. `chrome.storage.local` is comfortable with this (30 tokens × ~200 bytes ≈ 6 KB per account, well below the 10 MB quota); the cap is a UX safety net rather than a storage gate.

## Not in scope (yet)

- Token list import (Uniswap default list, CoinGecko, EIP-3091) — manual paste only.
- Per-token logo fetch from a remote metadata service or IPFS — tokens render with a generic first-letter bubble.
- Fiat price quotes per token.
- Batched balance reads via `Multicall3` — each registered token currently adds one `eth_call` to Home's refresh cycle.
- ERC-20 sends from EVM-source accounts — the asset selector disables non-XTZ assets when the active account is EVM-kind.
- FA1.2 / FA2 tokens on the Michelson runtime — the registry is ERC-20-only.
- Token Approvals page (list approved spenders per token, revoke approvals).

## See also

- [View Balances](./view-balances) — how registered tokens render on Home
- [Send XTZ](./send-xtz) — sending a registered token, including cross-runtime
- [Activity tab](./activity-tab) — where token transfers surface
