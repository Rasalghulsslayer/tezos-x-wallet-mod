/**
 * AddAccountFlowVM: the single source of truth for the add-account wizard's
 * step math on both shells. The flow asks one question per screen — choose
 * (how: derive / import / fresh), runtime (which side), input (secret), then
 * confirm — with the derived path skipping runtime+input (the hero on the
 * choose screen already carries the runtime choice, and there is nothing to
 * type). Kickers and step dots both project from here, so they can never
 * disagree (the previous fixed-length stepper showed "Step 2 of 2" under
 * dots reading 3 of 3).
 */

export type AddAccountStage      = 'choose' | 'runtime' | 'input' | 'confirm';
export type AddAccountSourceKind = 'derived' | 'fresh' | 'import';

export interface AddAccountPick {
  kind:   'tezos' | 'evm';
  source: AddAccountSourceKind;
}

export interface AddAccountFlowVM {
  stages: readonly AddAccountStage[];
  /** 0-based index of `stage` within `stages`. */
  index:  number;
  /** "Step i of n · label" — null on the choose screen (it is the router:
   *  the total is unknown until a path commits, so it shows no step math). */
  kicker: string | null;
  /** Props for the Dots stepper — null on the choose screen. */
  dots:   { i: number; n: number } | null;
}

export function addAccountStages(source: AddAccountSourceKind): readonly AddAccountStage[] {
  return source === 'derived'
    ? (['choose', 'confirm'] as const)
    : (['choose', 'runtime', 'input', 'confirm'] as const);
}

function stageLabel(stage: AddAccountStage, pick: AddAccountPick): string {
  switch (stage) {
    case 'runtime': return 'Choose runtime';
    case 'input':   return pick.source === 'import'
      ? 'Paste a secret'
      : pick.kind === 'tezos' ? 'Save your phrase' : 'Save your key';
    default:        return 'Review';
  }
}

/**
 * Projection for the current screen. `pick` is null only while the user is
 * still on the choose screen (no path committed yet).
 */
export function addAccountFlowVM(stage: AddAccountStage, pick: AddAccountPick | null): AddAccountFlowVM {
  if (stage === 'choose' || pick == null) {
    return { stages: addAccountStages(pick?.source ?? 'fresh'), index: 0, kicker: null, dots: null };
  }
  const stages = addAccountStages(pick.source);
  const index  = stages.indexOf(stage);
  const step   = index + 1;
  return {
    stages,
    index,
    kicker: `Step ${step} of ${stages.length} · ${stageLabel(stage, pick)}`,
    dots:   { i: index, n: stages.length },
  };
}
