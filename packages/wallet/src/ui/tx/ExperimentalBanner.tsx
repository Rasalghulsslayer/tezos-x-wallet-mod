export function ExperimentalBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        flexShrink:    0,
        padding:       '4px 10px',
        background:    'var(--tx-warning-bg)',
        color:         'var(--tx-warning)',
        borderBottom:  '1px solid rgba(255, 184, 76, 0.25)',
        fontSize:      11,
        lineHeight:    1.3,
        textAlign:     'center',
        letterSpacing: '0.01em',
      }}
    >
      Experimental software · Pre-release POC · Do not use with mainnet funds
    </div>
  );
}
