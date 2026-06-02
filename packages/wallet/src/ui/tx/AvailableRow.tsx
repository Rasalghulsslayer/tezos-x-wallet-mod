import type { Asset } from '@/domain/asset';

export function AvailableRow({
  available,
  asset,
  insufficient,
  loading,
  onMax,
}: {
  available:    string;
  asset:        Asset;
  insufficient: boolean;
  loading:      boolean;
  onMax?:       () => void;
}) {
  return (
    <div className={`tx-avail${insufficient && !loading ? ' is-low' : ''}`}>
      <span className="tx-avail-text">
        {insufficient && !loading && (
          <span className="tx-avail-ico" aria-hidden="true">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1.25" />
              <path d="M6 3.5v3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              <circle cx="6" cy="8.5" r="0.65" fill="currentColor" />
            </svg>
          </span>
        )}
        <span className="tx-avail-label">Available</span>
        <span className="tx-avail-sep">·</span>
        {loading
          ? <span className="tx-skel tx-skel-num" aria-hidden="true" />
          : <span className="tx-avail-num">{available} {asset.symbol}</span>
        }
      </span>
      <button
        type="button"
        className="tx-max-pill"
        onClick={onMax}
        disabled={loading || onMax == null}
      >
        MAX
      </button>
    </div>
  );
}
