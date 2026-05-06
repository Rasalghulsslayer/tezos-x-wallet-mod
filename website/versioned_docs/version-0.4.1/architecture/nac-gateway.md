---
id: nac-gateway
title: NAC Gateway
sidebar_position: 4
---

# NAC Gateway

**NAC** (Cross-Runtime Atomic Calls) is the Tezos X mechanism for routing
execution between the Michelson runtime Michelson runtime and the Tezlink EVM runtime
within a single atomic operation.

## The two directions

NAC is bidirectional. Each direction uses a different surface:

| Direction | Surface | Used by |
|---|---|---|
| **EVM → Michelson** | NAC precompile at `0xff00...0007`, called via the EVM selector `callMichelson(string,string,bytes)` | dApps running on Tezlink that want to invoke a Michelson contract |
| **Michelson → EVM** | NAC gateway contract (KT1...) on the Michelson runtime, entrypoint `call_evm` | **The relayer** — wraps every user EVM transaction as a Michelson op |

## What the relayer does

The relayer uses the **Michelson → EVM** direction. Temple can only sign Michelson runtime
operations, so instead of submitting an EVM transaction directly, the relayer
wraps the user's intent into a Michelson op targeting the NAC gateway's
`call_evm` entrypoint. The Tezos X kernel receives the op, synthesizes the
corresponding EVM transaction, and executes it with `msg.sender` set to the
user's EVM alias.

## `call_evm` entrypoint signature

```
pair string (pair string (pair bytes (option (contract bytes))))
```

| Field | Type | Content |
|---|---|---|
| `destination` | `string` | The target EVM contract address (`0x...`) |
| `method_sig`  | `string` | The full text signature of the EVM function, e.g. `"transfer(address,uint256)"`. The kernel recomputes the 4-byte selector from this string. See [Selector resolution](#selector-resolution) below for how the relayer derives this from the ethers.js / viem calldata. |
| `calldata`    | `bytes`  | ABI-encoded parameters (no selector prefix — the kernel prepends it) |
| `callback`    | `option (contract bytes)` | Optional Michelson callback invoked by the kernel after the EVM call finishes. The relayer always passes `None` (the second argument of `GatewayBuilder.fromEthTransaction` is defaulted to `{ prim: 'None' }` and exposed for future use cases). |

## Micheline built by the relayer

For a non-empty calldata EVM transaction, `GatewayBuilder.fromEthTransaction`
produces:

```json
{
  "prim": "Pair",
  "args": [
    { "string": "0xTargetEvmAddress" },
    { "prim": "Pair", "args": [
        { "string": "transfer(address,uint256)" },
        { "prim": "Pair", "args": [
            { "bytes": "abi-encoded-params-hex" },
            { "prim": "None" }
          ]
        }
      ]
    }
  ]
}
```

For a bare XTZ transfer (no calldata), the relayer uses the `default`
entrypoint instead:

```json
{ "string": "0xRecipient" }
```

## Flow

```mermaid
sequenceDiagram
    autonumber
    participant dApp
    participant Relayer as Relayer<br/>(window.ethereum)
    participant Temple
    participant L1 as Michelson runtime
    participant Gateway as NAC Gateway<br/>(KT1...)
    participant Kernel as Tezos X Kernel<br/>(EVM runtime)

    dApp->>Relayer: eth_sendTransaction({to, data, value})
    Relayer->>Relayer: fromEthTransaction → Micheline
    Relayer->>Kernel: eth_blockNumber (snapshot)
    Relayer->>Temple: requestOperation(call_evm, Pair(...))
    Temple->>L1: inject signed operation
    L1->>Gateway: transaction(entrypoint=call_evm, Pair(...))
    Gateway->>Kernel: atomic forward
    Note over Kernel: synthesizes EVM tx<br/>msg.sender = user's 0x alias
    Kernel-->>Relayer: L1 opHash (via Temple)
    Relayer-->>dApp: synthetic hash (keccak256(opHash))
    dApp->>Relayer: eth_getTransactionByHash / Receipt
    Relayer->>Kernel: scan blocks from snapshot
    Kernel-->>Relayer: real EVM tx + receipt + logs
    Relayer-->>dApp: real transaction / receipt
```

## Selector resolution

The NAC gateway expects the **full method signature** as a string, not a
4-byte hex selector. Standard EVM clients (ethers.js, viem) only provide
the selector in the calldata. The relayer closes this gap in
`GatewayBuilder.fromEthTransaction` via a three-tier resolver:

1. **Local `KNOWN_SIGNATURES` registry** — ships with the Tezos X-specific
   `callMichelson(string,string,bytes)` selector plus the standard ERC-20
   surface (`transfer`, `approve`, `transferFrom`, `balanceOf`,
   `allowance`, `totalSupply`, `decimals`) and common DeFi escrow
   selectors (`deposit(uint256)`, `withdraw(uint256)`, `claim()`,
   `unstake(uint256)`, bare `deposit()` / `withdraw()`).
2. **4byte.directory lookup** — for selectors not in the local registry.
   `results[0]` is used.
3. **Raw hex fallback** — if both lookups fail, the relayer passes the
   hex selector string. The kernel will reject the call unless the target
   contract happens to accept raw-hex as a valid signature (rare).

:::caution
4byte.directory can return colliding signatures for common 4-byte
prefixes (e.g., `0xb6b55f25` is `deposit(uint256)` but another unrelated
method was registered first and comes back as `results[0]`). When the
kernel recomputes the selector from the wrong string, the target
contract rejects the call — typically with an empty-body `400 Bad
Request` from the EVM runtime. Prefer adding the selector to
`KNOWN_SIGNATURES` for deterministic resolution.
:::

Every `call_evm` build logs the resolved mapping:
```
[TezosX Relayer] gateway selector → 0xb6b55f25 → deposit(uint256)
```

## Sender identity

When the kernel executes the synthesized EVM transaction:

- On the **EVM side**: `msg.sender` is the user's EVM alias (`0x...`), derived
  deterministically from their tz1 address via `tez_getTezosEthereumAddress`.
- On the **Michelson side** (if the EVM call then invokes `callMichelson`):
  `Tezos.get_sender` returns the user's tz1 address, not the NAC gateway's
  address.

:::info
The NAC gateway is a pass-through for identity. Both the EVM alias and the
tz1 address refer to the same user, and the kernel preserves this mapping
across the runtime boundary.
:::
