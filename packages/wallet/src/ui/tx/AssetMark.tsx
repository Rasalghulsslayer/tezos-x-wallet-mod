import xtzLogo  from '../../../icons/tezos-logo.svg';
import usdcLogo from '../../../icons/circle-usdc.png';

type Asset = 'xtz' | 'usdc';

const ICON: Record<Asset, string> = {
  xtz:  xtzLogo,
  usdc: usdcLogo,
};

export function AssetMark({ asset, size }: { asset: Asset; size?: 'sm' | 'lg' }) {
  return (
    <span className={['tx-asset', asset, size].filter(Boolean).join(' ')}>
      <img src={ICON[asset]} alt={asset} className="tx-asset-img" />
    </span>
  );
}
