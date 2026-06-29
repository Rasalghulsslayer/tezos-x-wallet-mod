import type { Asset } from '@tezosx/wallet-core/domain/asset';

export function InsufficientWarning({
  requested,
  available,
  asset,
}: {
  requested: string;
  available: string;
  asset:     Asset;
}) {
  return (
    <div className="tx-warn-banner" role="status" aria-live="polite">
      <span className="tx-warn-ico" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 1.5 14.5 13H1.5L8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M8 6.5v3.25" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="8" cy="11.4" r="0.75" fill="currentColor" />
        </svg>
      </span>
      <div>
        <div className="tx-warn-title">Likely insufficient funds</div>
        <div className="tx-warn-detail">
          Trying to send <span className="tx-warn-num">{requested}</span> but balance is{' '}
          <span className="tx-warn-num">{available} {asset.symbol}</span>. You can still attempt — the kernel may settle a balance the RPC hasn't refreshed.
        </div>
      </div>
    </div>
  );
}
