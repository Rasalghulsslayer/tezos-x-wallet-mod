/**
 * AssetMark: square asset icon. Native XTZ + known ERC-20 logos render their
 * image asset; unknown ERC-20s render a CSS-only first-letter bubble in
 * --tx-surface-3 with --tx-fg-muted. No remote logo fetch (out of scope).
 */

import type { Asset } from '../../domain/asset';
import xtzLogo  from '../../../icons/tezos-logo.svg';
import usdcLogo from '../../../icons/circle-usdc.png';
import { USDC_CONTRACT } from '../../shared/constants';

const KNOWN_LOGOS: Record<string, string> = {
  [USDC_CONTRACT.toLowerCase()]: usdcLogo,
};

type MarkSize = 'sm' | 'lg';

export function AssetMark({ asset, size }: { asset: Asset; size?: MarkSize }) {
  const variant = classifyVariant(asset);
  const classes = ['tx-asset', variant.cssVariant, size].filter(Boolean).join(' ');
  if (variant.kind === 'image') {
    return (
      <span className={classes}>
        <img src={variant.src} alt={asset.symbol} className="tx-asset-img" />
      </span>
    );
  }
  return (
    <span className={classes} role="img" aria-label={asset.symbol}>
      <span className="tx-asset-letter">{variant.letter}</span>
    </span>
  );
}

interface ImageVariant { kind: 'image'; src: string; cssVariant: string }
interface LetterVariant { kind: 'letter'; letter: string; cssVariant: string }
type AssetVariant = ImageVariant | LetterVariant;

function classifyVariant(asset: Asset): AssetVariant {
  if (asset.kind === 'xtz') return { kind: 'image', src: xtzLogo, cssVariant: 'xtz' };
  const knownLogo = KNOWN_LOGOS[asset.address.toLowerCase()];
  if (knownLogo != null) {
    const cssVariant = asset.symbol.toLowerCase();             // 'usdc' for the USDC entry
    return { kind: 'image', src: knownLogo, cssVariant };
  }
  const letter = (asset.symbol[0] ?? '?').toUpperCase();
  return { kind: 'letter', letter, cssVariant: 'generic' };
}
