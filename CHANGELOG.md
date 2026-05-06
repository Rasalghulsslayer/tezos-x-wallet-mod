# Changelog

This monorepo ships **two independently versioned packages**. Each has its own changelog with the full set of release notes:

- **`@tezosx/relayer`** — [packages/relayer/CHANGELOG.md](packages/relayer/CHANGELOG.md)
- **`@tezosx/wallet`** — [packages/wallet/CHANGELOG.md](packages/wallet/CHANGELOG.md)

This file is an index of releases. For details (added / changed / fixed / compatibility notes), follow the link to the relevant package changelog.

---

## 2026-05-06

- **`@tezosx/wallet` 0.4.2** — patch release: solves the residual `evm_node.dev.insufficient_fees` rejections that the 0.4.1 buffer didn't catch. Root cause was that Taquito's fee formula is hardcoded against Tezos mainnet constants (`MINIMAL_FEE_PER_GAS_MUTEZ = 0.1`, `MINIMAL_FEE_PER_BYTE_MUTEZ = 1`) while the TezosX kernel uses a different schedule (cheaper gas, more expensive bytes) — no multiplier on the wrong base formula could yield the kernel's exact value. `LocalSignerClient` now reads live constants from `chains/main/mempool/filter` and computes the kernel-exact fee; same approach as `octez-client` post-MRs !21028/21050/21155/21199. → [details](packages/wallet/CHANGELOG.md#042--2026-05-06)
- **`@tezosx/wallet` 0.4.1** — patch release: first attempt at fixing `evm_node.dev.insufficient_fees` rejections via a Taquito pre-estimate + flat `× 1.2` safety buffer (superseded by 0.4.2). Ships the UI/docs rebrand to align with the Tezos X narrative ("Tezos L1" → "Michelson runtime", "Tezos L2" → "EVM runtime"; internal identifiers untouched). New Tezos SVG brand logos. → [details](packages/wallet/CHANGELOG.md#041--2026-05-06)

---

## 2026-05-05

- **`@tezosx/relayer` 0.4.1** — public hash-resolution APIs: `resolveSyntheticHash` and `getPendingL1Hash` on `RelayerProvider`, so wallet UIs can wait for the kernel-synthesized real EVM hash before showing transaction results. Additive, no breaking change. → [details](packages/relayer/CHANGELOG.md#041--2026-05-05)
- **`@tezosx/wallet` 0.4.0** — two things in one release:
  1. **Same-runtime XTZ transfers skip the NAC gateway** — `tz1 → tz1 / KT1` now emits a native Tezos L1 transfer via Taquito, saving the unnecessary CRAC round-trip.
  2. **Real EVM hash on cross-runtime sends** — the Send "Done" stage no longer shows a synthetic placeholder. After broadcasting the L1 op, the popup waits in a `resolving` stage until the kernel-synthesized real hash is mined, then renders the hash as a clickable link to the right explorer (tzkt for L1, Blockscout for L2). Falls back to the L1 op hash with an "EVM tx pending" hint on resolver timeout.
  3. USDC contract bumped to the Previewnet deployment `0xd77420F73B4612a7A99DBA8c2AFd30a1886b0344`. → [details](packages/wallet/CHANGELOG.md#040--2026-05-05)

---

## 2026-05-04

- **`@tezosx/wallet` 0.3.1** — Send page makes the cross-runtime semantics explicit: a `RoutingCard` reacts to the recipient address in real time (same-runtime `tz1 → tz1` vs cross-runtime `tz1 → 0x` via NAC gateway), Review stage shows a Routing row and a gradient arrow when the call crosses runtimes, asset cards no longer claim a fixed runtime for XTZ. New `lib/address.ts` helper for recipient parsing. UI-only, no wire-protocol change. → [details](packages/wallet/CHANGELOG.md#031--2026-05-04)
- **`@tezosx/relayer` 0.4.0** — **breaking, default network**: migration from the legacy `demo.txpark` testnet to **Tezos X Previewnet** (`evm.previewnet.tezosx.nomadic-labs.com` + `michelson.previewnet.tezosx.nomadic-labs.com`). Extension `host_permissions` and chain-name table updated to chain ID `128064`. → [details](packages/relayer/CHANGELOG.md#040--2026-05-04)
- **`@tezosx/wallet` 0.3.0** — inherits the Previewnet endpoints from relayer 0.4.0; explorer URLs (`blockscout.previewnet…` + `previewnet.tezosx.tzkt.io`) updated; Settings → Network reads Tezos X Previewnet; Home XTZ balance now capped at 2 decimal places. → [details](packages/wallet/CHANGELOG.md#030--2026-05-04)

---

## 2026-04-24

- **`@tezosx/relayer` 0.3.0** — monorepo restructure (now published as `@tezosx/relayer`), fee-model methods short-circuited (`eth_estimateGas`, `eth_gasPrice`, `eth_maxPriorityFeePerGas`, `eth_feeHistory`), `KNOWN_SIGNATURES` registry expanded with standard ERC-20 / DeFi escrow selectors, gateway selector logging. No breaking change vs 0.2.2. → [details](packages/relayer/CHANGELOG.md#030--2026-04-24)
- **`@tezosx/wallet` 0.2.0** — first release as a published package. UI redesign on the new `--tx-*` design system, Tezos `edsk…` import alongside BIP-39, L1 XTZ balance read from the tz1, Receive page, Buffer polyfill shim, shadcn cleanup. Embeds `@tezosx/relayer` 0.3.0. → [details](packages/wallet/CHANGELOG.md#020--2026-04-24)

---

## 2026-04-23

- **`@tezosx/relayer` 0.2.2** — `call_evm` migrated to the new 4-field Michelson signature (matches kernel hard reset). Breaking: only works against kernels deployed on or after 2026-04-22. → [details](packages/relayer/CHANGELOG.md#022--2026-04-23)
- **`@tezosx/wallet` 0.1.0** — initial wallet MVP shipped with the v0.3.0 monorepo restructure. → [details](packages/wallet/CHANGELOG.md#010--2026-04-23)

---

## 2026-04-22

- **`@tezosx/relayer` 0.2.1** — real EVM transaction resolution (`eth_getTransactionByHash` / `Receipt` map synthetic NAC hashes back to kernel-synthesized EVM tx), in-flight deduplication, RPC proxy fallback, callMichelson selector registry, fee/gas/storage limits raised, nonce now proxied. → [details](packages/relayer/CHANGELOG.md#021--2026-04-22)

---

## 2026-04-15

- **`@tezosx/relayer` 0.2.0** — Chrome/Brave/Firefox MV3 extension introduced (replaces Tampermonkey), persistent session tracking, popup UI. → [details](packages/relayer/CHANGELOG.md#020--2026-04-15)

---

## 2026-03-24

- **`@tezosx/relayer` 0.1.0** — first release. EIP-1193 provider, EIP-6963 discovery, Temple via Beacon, NAC gateway routing, Tampermonkey injection guide, Docusaurus docs, GitLab CI, playground. → [details](packages/relayer/CHANGELOG.md#010--2026-03-24)
