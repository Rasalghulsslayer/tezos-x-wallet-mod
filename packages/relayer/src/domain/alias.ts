/**
 * AliasMapping: the deterministic pair between a Tezos tz1 address and its
 * EVM 0x alias under Tezos X.
 */

export interface AliasMapping {
  tz1: string;
  evm: `0x${string}`;
}
