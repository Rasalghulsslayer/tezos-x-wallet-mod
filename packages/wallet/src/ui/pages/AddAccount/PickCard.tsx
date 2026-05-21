import { Icon } from '../../tx/Icon';
import type { Kind, Source } from './types';

export interface SpecRow { k: string; v: string }

export function PickCard({
  kind, source, title, subLine, specs, onClick, disabled,
}: {
  kind:      Kind;
  source:    Source;
  title:     string;
  subLine:   string;
  specs:     SpecRow[];
  onClick:   () => void;
  disabled?: boolean;
}) {
  const chainBadge = kind === 'tezos' ? 'L1' : 'L2';
  return (
    <button
      type="button"
      className={`tx-add-pick-card ${kind === 'tezos' ? 'l1' : 'l2'}`}
      onClick={onClick}
      disabled={disabled}
      style={disabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
    >
      <div className="top">
        <span className="badge">{chainBadge}</span>
        <span className="op">{source === 'fresh' ? 'Create' : 'Import'}</span>
      </div>
      <div className="ti">{title}</div>
      <div className="sub-line">{subLine}</div>
      <div className="specs">
        {specs.map((s) => (
          <div className="spec-row" key={s.k}>
            <span>{s.k}</span><span className="v">{s.v}</span>
          </div>
        ))}
      </div>
      <span className="accent-arrow"><Icon name="arrow-right" size={11} /></span>
    </button>
  );
}
