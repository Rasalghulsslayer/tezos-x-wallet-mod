import { LogoMark } from './LogoMark';

export function Logo({ large }: { large?: boolean }) {
  return (
    <span className="tx-logo">
      <LogoMark size={large ? 44 : 24} />
      {!large && <span>Tezos X</span>}
    </span>
  );
}
