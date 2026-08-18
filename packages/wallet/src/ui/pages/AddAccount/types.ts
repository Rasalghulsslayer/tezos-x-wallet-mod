import type {
  AddAccountPick,
  AddAccountSourceKind,
  AddAccountStage,
} from '@tezosx/wallet-core/view-models/add-account-flow-vm';

// The wizard's step math lives in the core view-model; the local aliases keep
// the page files on the short names they always used.
export type Stage  = AddAccountStage;
export type Source = AddAccountSourceKind;
export type Pick   = AddAccountPick;
export type Kind   = AddAccountPick['kind'];
export type TzMode = 'mnemonic' | 'edsk';

export interface Preview {
  primary:    string;
  secondary?: string;
}

export const TEZOS_LABEL_CHIPS = ['Trading', 'Treasury', 'Cold', 'Test'] as const;
export const EVM_LABEL_CHIPS   = ['Hot', 'Cold', 'DEX', 'Treasury']   as const;
