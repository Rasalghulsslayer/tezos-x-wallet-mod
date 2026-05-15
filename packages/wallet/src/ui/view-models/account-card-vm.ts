/**
 * AccountCardVM: presentation shape for the active account, unifying Tezos
 * and EVM kinds for AccountCard, Home, Send, Receive, Settings. Tezos
 * accounts expose both an L1 (tz1) and an L2 (alias) face; EVM accounts
 * expose only their 0x address.
 */

import type { VaultStateUnlocked } from '../../shared/messages';

export interface AccountFace {
  chain:   'l1' | 'l2';
  label:   string;          // human-readable runtime name
  address: string;          // tz1 / 0x
}

export interface AccountCardVM {
  kind:       'tezos' | 'evm';
  identitySeed: string;     // input for Identicon
  primary:    AccountFace;
  secondary?: AccountFace;
}

export function accountCardVM(state: VaultStateUnlocked): AccountCardVM {
  if (state.kind === 'tezos') {
    return {
      kind:         'tezos',
      identitySeed: state.tz1,
      primary:      { chain: 'l1', label: 'Michelson',   address: state.tz1 },
      secondary:    { chain: 'l2', label: 'EVM runtime', address: state.evmAlias },
    };
  }
  return {
    kind:         'evm',
    identitySeed: state.address,
    primary:      { chain: 'l2', label: 'EVM runtime', address: state.address },
  };
}

/** Convenience: the address used as "signing source" for a Send/Approve flow. */
export function signingSourceAddress(state: VaultStateUnlocked): string {
  return state.kind === 'tezos' ? state.tz1 : state.address;
}
