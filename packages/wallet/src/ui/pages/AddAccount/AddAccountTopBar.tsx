import { Icon } from '../../tx/Icon';
import { Dots } from '../../tx/Dots';

export function AddAccountTopBar({
  title, onBack, onClose, dots, capN, capMax, showCap,
}: {
  title:   string;
  onBack:  () => void;
  onClose: () => void;
  /** Step dots from the flow VM — null on the choose screen (no step math there). */
  dots:    { i: number; n: number } | null;
  capN:    number;
  capMax:  number;
  showCap: boolean;
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
        {dots != null && <Dots i={dots.i} n={dots.n} />}
        {showCap && (
          <span className={`tx-add-cap${capN >= capMax ? ' danger' : ''}`} title="Accounts in vault">
            {Math.min(capN + 1, capMax)} / {capMax}
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
