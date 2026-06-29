/**
 * AssetSelector: button-grid asset picker for the Send page. One button per
 * Asset; the selected button is ringed in its runtime accent. An optional
 * "+" footer affordance navigates to the AddToken flow (wired in CT3b).
 */

import type { Asset } from '@tezosx/wallet-core/domain/asset';
import { AssetMark } from './AssetMark';
import { Icon } from './Icon';

export interface AssetOption {
  asset:    Asset;
  /** Sub-label shown under the symbol (e.g. "Native asset", "ERC-20 · EVM runtime"). */
  subLabel: string;
  /** When true the button is rendered disabled; `title` carries the explanation. */
  disabled?: boolean;
  title?:   string;
}

export function AssetSelector({
  options,
  selected,
  onSelect,
  onAddToken,
}: {
  options:     AssetOption[];
  /** Currently-selected asset (must be one of `options[].asset`). */
  selected:    Asset;
  onSelect:    (asset: Asset) => void;
  /** Optional "+ Add token" affordance — when null, the row isn't rendered. */
  onAddToken?: () => void;
}) {
  return (
    <div className="tx-asset-selector">
      {options.map((opt) => {
        const isActive = isSameAsset(opt.asset, selected);
        const ring = isActive ? (opt.asset.kind === 'xtz' && opt.asset.runtime === 'michelson' ? 'l1' : 'l2') : null;
        return (
          <button
            key={keyOf(opt.asset)}
            type="button"
            className={`tx-btn ${isActive ? 'outline' : 'ghost'}`}
            disabled={opt.disabled === true}
            onClick={() => !opt.disabled && onSelect(opt.asset)}
            style={{
              height: 56,
              justifyContent: 'flex-start',
              padding: '0 12px',
              opacity: opt.disabled === true ? 0.5 : 1,
              cursor: opt.disabled === true ? 'not-allowed' : 'pointer',
              boxShadow: ring === 'l1' ? 'inset 0 0 0 1px var(--tx-purple)'
                       : ring === 'l2' ? 'inset 0 0 0 1px var(--tx-cyan)'
                       : undefined,
            }}
            title={opt.title}
          >
            <AssetMark asset={opt.asset} size="sm" />
            <div style={{ textAlign: 'left', marginLeft: 4, minWidth: 0 }}>
              <div style={{ fontSize: 13 }}>{opt.asset.symbol}</div>
              <div style={{ fontSize: 11, color: 'var(--tx-fg-muted)', fontWeight: 400 }}>{opt.subLabel}</div>
            </div>
          </button>
        );
      })}

      {onAddToken != null && (
        <button
          type="button"
          className="tx-btn ghost tx-asset-selector-add"
          onClick={onAddToken}
          style={{ height: 56, justifyContent: 'center', gap: 6 }}
        >
          <Icon name="plus" size={14} />
          <span>Add token</span>
        </button>
      )}
    </div>
  );
}

function keyOf(asset: Asset): string {
  return asset.kind === 'xtz' ? `xtz:${asset.runtime}` : `erc20:${asset.address.toLowerCase()}`;
}

function isSameAsset(a: Asset, b: Asset): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'xtz' && b.kind === 'xtz') return a.runtime === b.runtime;
  if (a.kind === 'erc20' && b.kind === 'erc20') return a.address.toLowerCase() === b.address.toLowerCase();
  return false;
}
