/**
 * AssetRow: single row of the Home assets list. Identicon-style glyph with
 * a runtime pip (purple = L1, cyan = L2), symbol + runtime label, formatted
 * balance on the right.
 */

import type { AssetRowVM } from '../view-models/asset-row-vm';
import { AssetMark } from './AssetMark';

export function AssetRow({
  vm,
  displayBalance,
}: {
  vm:             AssetRowVM;
  /** Pre-formatted balance text. Caller decides "••••" / "—" / numeric. */
  displayBalance: string;
}) {
  return (
    <div className="tx-home-asset-row">
      <div className="glyph-wrap">
        <AssetMark asset={vm.asset} />
        <span className="runtime-pip" aria-hidden>
          <span className={`core ${vm.runtimeBadge}`} />
        </span>
      </div>
      <div className="body">
        <div className="nm">{vm.symbol}</div>
        <div className="runtime">{vm.runtimeLabel}</div>
      </div>
      <div className="amt">
        <div className="v">{displayBalance}</div>
      </div>
    </div>
  );
}
