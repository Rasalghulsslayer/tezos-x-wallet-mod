import type { AccountId } from '@tezosx/wallet-core/domain/account';

export type Secret =
  | { kind: 'mnemonic'; value: string }
  | { kind: 'edsk';     value: string }
  | { kind: 'evm-pk';   value: string };

export type Modal =
  | { kind: 'closed' }
  | { kind: 'picker' }
  | { kind: 'reveal'; accountId: AccountId }
  // The wallet-level seed phrase (what derived accounts hang off) — distinct
  // from a single account's own signing material.
  | { kind: 'reveal-seed' };
