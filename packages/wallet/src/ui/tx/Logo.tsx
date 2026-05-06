export function Logo({ large }: { large?: boolean }) {
  return (
    <span className="tx-logo">
      <span className={`tx-logo-mark ${large ? 'lg' : ''}`} />
      {!large && <span>Tezos X</span>}
    </span>
  );
}
