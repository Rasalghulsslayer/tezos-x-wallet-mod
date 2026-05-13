/**
 * Account discriminated union, AccountId, AccountKind. EvmAccount variant
 * is added in W4; for now Account === TezosAccount.
 */

export type AccountKind = 'tezos';

export type AccountId = string;

export interface TezosAccount {
  kind:      'tezos';
  id:        AccountId;
  label?:    string;
  tz1:       string;
  publicKey: string;
}

export type Account = TezosAccount;
