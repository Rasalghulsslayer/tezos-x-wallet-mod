export function Dots({ i, n, accent }: { i: number; n: number; accent?: 'purple' | 'cyan' }) {
  return (
    <span className="tx-dots" role="progressbar" aria-valuenow={i + 1} aria-valuemax={n}>
      {Array.from({ length: n }).map((_, k) => (
        <span key={k} className={`d ${k === i ? `on${accent != null ? ` ${accent}` : ''}` : k < i ? 'done' : ''}`} />
      ))}
    </span>
  );
}
