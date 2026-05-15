/**
 * Account discriminated union, AccountId, AccountKind. Account is a union of
 * TezosAccount (tz1 + ed25519 key material) and EvmAccount (0x + secp256k1).
 */

export type AccountKind = 'tezos' | 'evm';

export type AccountId = string;

export interface TezosAccount {
  kind:      'tezos';
  id:        AccountId;
  label?:    string;
  tz1:       string;
  publicKey: string;
}

export interface EvmAccount {
  kind:      'evm';
  id:        AccountId;
  label?:    string;
  address:   `0x${string}`;
  publicKey: `0x${string}`;
}

export type Account = TezosAccount | EvmAccount;
