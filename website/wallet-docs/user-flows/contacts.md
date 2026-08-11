---
id: contacts
title: Contacts
sidebar_label: Contacts
---

# Contacts

The address book puts a name over the public addresses you send to. A contact is **non-secret metadata** — a label plus a Tezos (`tz1 / tz2 / tz3 / KT1`) or EVM (`0x…`) address — and the book is **wallet-global**: it belongs to you, not to any single account. That is deliberate, and it is the opposite of the [custom-token registry](./custom-tokens), which is per-account: your peers do not change when you switch accounts, so every account sees the same contacts.

## Managing contacts

Open **Settings → Contacts** — the same entry exists on the extension and the mobile app. An add form (name + address) sits above the saved entries; each row shows the label, the truncated address, and a runtime pill for where the address lives.

### Add

Validation runs in the shared core (`packages/core/src/use-cases/add-contact.ts`) before anything is saved:

- The address must parse as a Tezos address (`tz1/tz2/tz3/KT1`) or a 40-hex-digit `0x` address.
- **EIP-55 checksums are enforced**: a mixed-case `0x` address whose casing doesn't match its keccak checksum is refused as a typo. Validation runs on the raw input *before* normalisation, so a broken checksum is rejected rather than laundered by the lowercasing (all-lowercase and all-uppercase addresses carry no checksum and are accepted).
- The name is required and capped at **32 characters** (`MAX_LABEL_LENGTH`).
- **One entry per address**: a duplicate is refused, and the error tells you which label already owns that address. Identity is case-insensitive for `0x` addresses — EIP-55 casing is display, not identity — and verbatim for Base58 addresses.
- The book holds at most **50 contacts** (`MAX_CONTACTS`).

### Rename and remove

Entries are label-sorted (case-insensitive) on both form factors. On the extension, **Rename** edits the label inline in the row; on mobile, tapping a row opens the rename sheet and the trailing trash icon asks for confirmation before removing. The address is the entry's **identity** and never changes — to move a name to a different address, remove the entry and add a new one.

## Contacts in the Send flow

The book feeds the [Send](./send-xtz) page at three points, all driven by the shared view-model (`packages/core/src/view-models/contacts-vm.ts`):

| Where | What you see |
|---|---|
| **Recipient field — typing** | Up to five suggestions matching your input against contact names (substring) or addresses (prefix), both case-insensitive; focusing the empty field offers the book up front. Picking one fills the address. |
| **Recipient field — resolved** | When the typed address is a saved contact, its name appears under the field (and the suggestions disappear — you already have a match). The Review stage's **To** lane shows the name again above the truncated address, so you confirm a name, not just a hex string. |
| **Done stage — save offer** | After a successful send to a valid address the book doesn't know yet, a **Save as contact** offer appears — type a name and save without leaving the flow. |

## Recovery keeps your contacts

Resetting the wallet ([forgot-password recovery](../technical/security-model#password-lifecycle)) wipes the vault, dApp sessions, and token registries — but deliberately **keeps the address book**: contacts are wallet-global and non-secret, and they are still useful after you re-import your seed phrase. Removing an account never touches the book either, for the same reason.

:::note Storage on mobile
On the phone, contacts live in plaintext MMKV, like dApp sessions and the token registry — no key material, but readable usage metadata to anything that can read the app's storage. Wrapping the MMKV instance with an at-rest encryption key held in the OS keystore is tracked as follow-up work. See [Mobile Security](../mobile/security).
:::

## See also

- [Send XTZ](./send-xtz) — the suggestions, name resolution, and save offer in context
- [Settings](./settings) — the Contacts row and the rest of the wallet management surface
