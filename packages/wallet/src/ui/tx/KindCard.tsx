/**
 * KindCard: a runtime-picker card — accent-ringed when selected, tap-to-go
 * when used as a navigation card (Welcome's selectable pair, AddAccount's
 * hero and runtime screens).
 */
export function KindCard({
  accent, chain, title, detail, selected = false, disabled = false, onClick,
}: {
  accent:    'purple' | 'cyan';
  chain:     'tz1' | '0x';
  title:     string;
  detail:    string;
  selected?: boolean;
  disabled?: boolean;
  onClick:   () => void;
}) {
  const ring = selected
    ? `inset 0 0 0 1.5px var(--tx-${accent})`
    : 'inset 0 0 0 1px var(--tx-border)';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="tx-btn"
      style={{
        height: 'auto',
        padding: '14px 12px',
        background: 'var(--tx-surface)',
        boxShadow: ring,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 6,
        textAlign: 'left',
        transition: 'box-shadow 160ms var(--tx-ease)',
      }}
    >
      <span className={`tx-badge ${accent}`} style={{ fontSize: 10 }}>{chain}</span>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{title}</span>
      <span style={{ fontSize: 11, color: 'var(--tx-fg-muted)' }}>{detail}</span>
    </button>
  );
}
