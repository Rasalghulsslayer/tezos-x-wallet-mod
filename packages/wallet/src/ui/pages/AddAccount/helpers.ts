import type { Pick, Stage } from './types';

export function stageTitle(stage: Stage, pick: Pick | null): string {
  if (stage === 'choose')  return 'Add account';
  if (stage === 'runtime') return 'Choose runtime';
  if (pick == null)        return 'Add account';
  if (stage === 'input') {
    const op = pick.source === 'fresh' ? 'New' : 'Import';
    const k  = pick.kind === 'tezos' ? 'Michelson' : 'EVM';
    return `${op} ${k} account`;
  }
  return pick.source === 'import' ? 'Confirm import' : 'Confirm new account';
}

export function stageHeadline(pick: Pick): string {
  if (pick.source === 'fresh') {
    return pick.kind === 'tezos' ? 'Your recovery phrase' : 'Your private key';
  }
  return pick.kind === 'tezos' ? 'Recovery phrase or edsk' : 'EVM private key';
}
