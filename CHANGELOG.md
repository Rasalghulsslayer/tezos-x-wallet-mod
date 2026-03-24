# Changelog

All notable changes to the Tezos X Relayer are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) — versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.1.0] — 2026-03-24

### Added
- EIP-1193 provider (`window.ethereum`) injected at runtime via IIFE bundle
- EIP-6963 multi-wallet discovery — announces the relayer to dApps using RainbowKit, wagmi, etc.
- Temple Wallet connection via Beacon SDK (`eth_requestAccounts`)
- Transaction routing through CRAC gateway (`callMichelson` entrypoint)
- Supported EIP-1193 methods: `eth_requestAccounts`, `eth_accounts`, `eth_chainId`, `net_version`, `eth_getBalance`, `eth_getTransactionCount`, `eth_sendTransaction`, `eth_getTransactionReceipt`
- tz1 → EVM alias derivation via `tez_getEthereumTezosAddress` RPC
- Tampermonkey userscript injection guide (inline bundle for EIP-6963 timing)
- Docker Compose setup for local development
- Docusaurus documentation site with architecture diagrams, API reference, and user flows
- GitLab CI pipeline deploying docs to GitLab Pages
- Playground frontend (Next.js) for manual testing: connect, transfer, Counter contract interactions

### Known limitations
- `eth_call` not implemented in the relayer (read-only calls must go directly to Tezlink RPC)
- `eth_sign`, `personal_sign`, EIP-712 not supported (SIWE out of scope for V1)
- Nonce management not implemented (`eth_getTransactionCount` returns `0x0`)

---

## Upcoming

### [0.2.0] — planned
- `eth_call` support
- `eth_sign` and `personal_sign` support
- Improved Beacon error handling (Buffer polyfill, Matrix relay fallback)