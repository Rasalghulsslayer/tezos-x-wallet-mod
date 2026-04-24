export function Line({
  label,
  value,
  sub,
  strong,
}: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
}) {
  return (
    <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ fontSize: 13, color: 'var(--tx-fg-muted)' }}>{label}</span>
      <span style={{ textAlign: 'right' }}>
        <div style={{ fontSize: strong ? 15 : 13, fontWeight: strong ? 600 : 500, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: 'var(--tx-fg-subtle)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
            {sub}
          </div>
        )}
      </span>
    </div>
  );
}
