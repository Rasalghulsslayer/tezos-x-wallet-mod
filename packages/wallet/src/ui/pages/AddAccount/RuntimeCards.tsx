import { KindCard } from '../../tx/KindCard';
import { KindRow } from '../../tx/KindRow';
import type { Kind } from './types';

/**
 * The Michelson / EVM pair. Rendered twice in the flow — compact cards inside
 * the choose screen's hero (derived path), full-width rows on the runtime
 * screen (import / fresh paths) — so the titles and sublines live in one
 * place.
 */
export function RuntimeCards({ onPick, disabled, rows = false }: {
  onPick:    (kind: Kind) => void;
  disabled?: boolean;
  rows?:     boolean;
}) {
  if (rows) {
    return (
      <div className="tx-add-kind-rows">
        <KindRow
          accent="purple"
          glyph="tz1"
          title="Michelson account"
          detail="tz1 + 0x alias — works in both runtimes."
          selected={false}
          onClick={() => onPick('tezos')}
        />
        <KindRow
          accent="cyan"
          glyph="0x"
          title="EVM account"
          detail="0x address — EVM runtime only."
          selected={false}
          onClick={() => onPick('evm')}
        />
      </div>
    );
  }
  return (
    <div className="tx-add-kind-grid">
      <KindCard
        accent="purple"
        chain="tz1"
        title="Michelson account"
        detail="tz1 + 0x alias — works in both runtimes."
        disabled={disabled}
        onClick={() => onPick('tezos')}
      />
      <KindCard
        accent="cyan"
        chain="0x"
        title="EVM account"
        detail="0x address — EVM runtime only."
        disabled={disabled}
        onClick={() => onPick('evm')}
      />
    </div>
  );
}
