type Asset = 'xtz' | 'usdc' | 'etherlink';

export function AssetMark({ asset, size }: { asset: Asset; size?: 'sm' | 'lg' }) {
  const letter = { xtz: 'ꜩ', usdc: '$', etherlink: 'E' }[asset];
  return <span className={['tx-asset', asset, size].filter(Boolean).join(' ')}>{letter}</span>;
}
