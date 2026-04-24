---
id: send-xtz
title: Send XTZ
sidebar_label: Send XTZ
---

# Send XTZ

The Send screen lets you transfer XTZ to any Tezos or Etherlink address through the NAC gateway.

## Steps

1. Click **Send XTZ** on the Home screen
2. **Stage 1 — Form**: enter the destination address and amount
3. **Stage 2 — Review**: confirm destination, amount, and network
4. **Stage 3 — Sent**: view the transaction hash and return home

## Accepted address formats

The destination field accepts any of:

| Format | Example |
|---|---|
| `tz1…` | tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb |
| `tz2…` | tz2TSvNTh2epDMhZHrw73nV9piBX7kLZ9K9m |
| `tz3…` | tz3Nk25mfsfsceBdHXDqHDP6KpUNAbGxksZX |
| `KT1…` | KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw |
| `0x…` | 0x1234…abcd (Etherlink / EVM address) |

All formats are validated by regex before Stage 2 is shown.

## Amount validation

- Must be a positive decimal number (e.g. `1`, `0.5`, `1.23456`)
- Cannot exceed your current XTZ balance
- Minimum: no enforced minimum (network will reject dust if needed)

## How the transaction is sent

The Send flow calls `eth_sendTransaction` on the service worker's `RelayerProvider`:

```ts
const hash = await provider.request({
  method: 'eth_sendTransaction',
  params: [{
    to: destinationAddress,
    value: amountInHexWei,   // e.g. "0xde0b6b3a7640000" for 1 XTZ
    data: '0x',
  }],
});
```

### Amount conversion

The XTZ decimal input is converted to hex wei:

```
wei = amount × 10^18
```

For example, `1.5 XTZ` → `1500000000000000000` → `"0x14d1120d7b160000"`.

### Routing through the NAC gateway

Because Tezos L1 does not natively execute EVM transactions, the `RelayerProvider` translates the call:

1. `GatewayBuilder` detects `data = "0x"` → bare transfer → uses the `default` entrypoint
2. `LocalSignerClient.sendContractCall("default", { string: destination }, mutezAmount)` is called
3. Taquito signs and injects the L1 operation
4. The returned L1 `opHash` is converted to a synthetic 32-byte EVM-style hash

### Mutez conversion

The NAC contract expects the amount in **mutez** (10^6 per tez):

```
mutez = wei / 10^12
```

(Since 1 tez = 10^6 mutez = 10^18 wei, dividing wei by 10^12 gives mutez.)

## Stage 3 — Transaction hash

On success, the wallet shows a synthetic transaction hash (32-byte hex prefixed with `0x`). This hash is derived from the Tezos L1 operation hash and can be used to poll for the real kernel-synthesized EVM receipt.

Click **Back to home** to return to the balance view.

:::info Receipt resolution
The hash shown is a synthetic hash. The real kernel-synthesized EVM transaction hash may differ. See the [Relayer architecture](../../docs/architecture/overview) for details on hash resolution.
:::
