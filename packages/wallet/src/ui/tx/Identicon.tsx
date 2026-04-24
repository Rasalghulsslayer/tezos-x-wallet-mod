export function Identicon({ seed = '0', size }: { seed?: string; size?: 'sm' | 'lg' }) {
  const hue = (seed.charCodeAt(0) * 7) % 360;
  return (
    <span
      className={['tx-identicon', size].filter(Boolean).join(' ')}
      style={{ filter: `hue-rotate(${hue}deg)` }}
    />
  );
}
