export function Dots({ i, n }: { i: number; n: number }) {
  return (
    <span className="tx-dots">
      {Array.from({ length: n }).map((_, k) => (
        <span key={k} className={`d ${k === i ? 'on' : ''}`} />
      ))}
    </span>
  );
}
