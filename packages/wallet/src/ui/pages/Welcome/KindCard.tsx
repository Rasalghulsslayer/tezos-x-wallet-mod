export function KindCard({
  accent, chain, title, detail, selected, onClick,
}: {
  accent:   'purple' | 'cyan';
  chain:    'L1' | 'L2';
  title:    string;
  detail:   string;
  selected: boolean;
  onClick:  () => void;
}) {
  const ring = selected
    ? `inset 0 0 0 1.5px var(--tx-${accent})`
    : 'inset 0 0 0 1px var(--tx-border)';
  return (
    <button
      onClick={onClick}
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
