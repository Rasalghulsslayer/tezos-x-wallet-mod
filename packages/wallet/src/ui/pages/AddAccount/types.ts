export type Kind   = 'tezos' | 'evm';
export type Source = 'fresh'  | 'import' | 'derived';
export type Stage  = 'pick'   | 'input' | 'confirm';
export type TzMode = 'mnemonic' | 'edsk';

export interface Pick { kind: Kind; source: Source }

export interface Preview {
  primary:    string;
  secondary?: string;
}

export const STAGES: readonly Stage[] = ['pick', 'input', 'confirm'] as const;

export const TEZOS_LABEL_CHIPS = ['Trading', 'Treasury', 'Cold', 'Test'] as const;
export const EVM_LABEL_CHIPS   = ['Hot', 'Cold', 'DEX', 'Treasury']   as const;
