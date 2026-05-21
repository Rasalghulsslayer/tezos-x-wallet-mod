import { Icon } from '../../tx/Icon';
import { Dots } from '../../tx/Dots';
import { STAGES } from './types';

export function AddAccountTopBar({
  title, onBack, onClose, stageIdx, capN, capMax, showCap,
}: {
  title:    string;
  onBack:   () => void;
  onClose:  () => void;
  stageIdx: number;
  capN:     number;
  capMax:   number;
  showCap:  boolean;
}) {
  return (
    <div className="tx-topbar" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <button
          type="button"
          className="tx-topbar-back"
          onClick={onBack}
          aria-label="Back"
          style={{ background: 'transparent', border: 0 }}
        >
          <Icon name="arrow-left" size={18} />
        </button>
        <span className="tx-topbar-title">{title}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Dots i={stageIdx} n={STAGES.length} />
        {showCap && (
          <span className="tx-add-cap" title="Accounts in vault">
            {capN + 1} / {capMax}
          </span>
        )}
        <button
          type="button"
          className="tx-topbar-back"
          onClick={onClose}
          aria-label="Close"
          style={{ background: 'transparent', border: 0, color: 'var(--tx-fg-subtle)' }}
        >
          <Icon name="x" size={14} />
        </button>
      </div>
    </div>
  );
}
