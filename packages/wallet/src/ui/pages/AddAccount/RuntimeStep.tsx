import { RuntimeCards } from './RuntimeCards';
import { StepHead } from './StepHead';
import type { Kind } from './types';

/**
 * Screen 2 (import / fresh paths only — the derived hero already carries the
 * runtime choice). Full-width rows fit the longer sublines the hero's compact
 * cards truncate; repeating the same pair is deliberate, so these paths
 * recognise the decision they skipped.
 */
export function RuntimeStep({ kicker, onPick }: {
  kicker: string | null;
  onPick: (kind: Kind) => void;
}) {
  return (
    <div className="tx-page-scroll">
      <StepHead icon="globe" kicker={kicker} title="Which runtime does this account belong to?" />
      <RuntimeCards rows onPick={onPick} />
    </div>
  );
}
