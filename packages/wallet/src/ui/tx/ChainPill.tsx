export function ChainPill({ chain }: { chain: 'l1' | 'l2' }) {
  return (
    <span className={`tx-chain-pill ${chain}`}>
      <span className="dot" />
      {chain === 'l1' ? 'Tezos L1' : 'Tezos L2'}
    </span>
  );
}
