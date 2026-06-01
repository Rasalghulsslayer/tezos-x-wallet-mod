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
  | { source: 'privkey';  privateKey: string };

export interface AccountSummary {
  id:                AccountId;
  kind:              AccountKind;
  label?:            string;
  primaryAddress:    string;
  secondaryAddress?: string;
  createdAt:         number;
}
