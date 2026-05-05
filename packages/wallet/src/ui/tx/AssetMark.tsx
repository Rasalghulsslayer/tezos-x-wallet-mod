type Asset = 'xtz' | 'usdc';

export function AssetMark({ asset, size }: { asset: Asset; size?: 'sm' | 'lg' }) {
  const letter = { xtz: 'ꜩ', usdc: '$' }[asset];
  return <span className={['tx-asset', asset, size].filter(Boolean).join(' ')}>{letter}</span>;
}
