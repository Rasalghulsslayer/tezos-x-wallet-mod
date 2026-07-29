/**
 * Account discriminated union (TezosAccount | EvmAccount), AccountId, AccountKind.
 * AccountId is a UUID v4 from 0.9.0; legacy address-as-id values are migrated
 * to UUIDs on first unlock (see Keyring.unlock).
 */

export type AccountKind = 'tezos' | 'evm';

export type AccountId = string;

export interface TezosAccount {
  kind:      'tezos';
  id:        AccountId;
  label?:    string;
  tz1:       string;
  publicKey: string;
  createdAt: number;
}

export interface EvmAccount {
  kind:      'evm';
  id:        AccountId;
  label?:    string;
  address:   `0x${string}`;
  publicKey: `0x${string}`;
  createdAt: number;
}

export type Account = TezosAccount | EvmAccount;

export type AddAccountSource =
  | { source: 'fresh' }
  | { source: 'mnemonic'; mnemonic:   string }
  | { source: 'edsk';     edsk:       string }
  | { source: 'privkey';  privateKey: string }
  // Next account derived from the wallet seed phrase at the next unused HD
  // index for the requested kind — nothing new to back up.
  | { source: 'derived' };

export interface AccountSummary {
  id:                AccountId;
  kind:              AccountKind;
  label?:            string;
  primaryAddress:    string;
  secondaryAddress?: string;
  createdAt:         number;
  /** HD index for accounts derived from the wallet seed; absent for
   *  standalone (imported / per-account-secret) accounts. */
  derivationIndex?:  number;
}
