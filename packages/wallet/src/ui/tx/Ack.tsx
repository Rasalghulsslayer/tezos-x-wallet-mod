import { Icon } from './Icon';

/**
 * Ack: a gating acknowledgement rendered as a 44px surface row, not a naked
 * checkbox — on the onboarding screens these rows ARE the content, and the
 * accent fill tells the user which runtime's secret they are about to be
 * handed (purple = Michelson, cyan = EVM).
 */
export function Ack({
  checked, onToggle, accent = 'purple', children,
}: {
  checked:  boolean;
  onToggle: () => void;
  accent?:  'purple' | 'cyan';
  children: React.ReactNode;
}) {
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      className={`tx-ack ${accent}`}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle(); }
      }}
    >
      <span className={`tx-ck${checked ? ' on' : ''} ${accent}`}><Icon name="check" size={12} strokeWidth={2.4} /></span>
      <span>{children}</span>
    </div>
  );
}
