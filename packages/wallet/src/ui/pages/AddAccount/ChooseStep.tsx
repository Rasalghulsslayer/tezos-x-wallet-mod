import { useState } from 'react';
import { MAX_ACCOUNTS_PER_VAULT } from '@tezosx/wallet-core/shared/constants';
import { Icon } from '../../tx/Icon';
import { RuntimeCards } from './RuntimeCards';
import type { Kind } from './types';

/**
 * Screen 1 — the flow's router, one decision only. With a wallet seed the
 * derived path leads as a hero (runtime is the only remaining question, so
 * tapping a runtime card jumps straight to confirm); import and fresh keys
 * sit behind a collapsed disclosure. Without a seed there is nothing to
 * derive, so the two source rows are all there is.
 */
export function ChooseStep({ capReached, hasSeed, onDerived, onSource }: {
  capReached: boolean;
  hasSeed:    boolean;
  onDerived:  (kind: Kind) => void;
  onSource:   (source: 'import' | 'fresh') => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  const sourceRows = (
    <div className="tx-add-source-rows">
      <SourceRow
        title="Import existing keys"
        sub="Recovery phrase, edsk key, or 0x private key."
        disabled={capReached}
        onClick={() => onSource('import')}
      />
      <SourceRow
        title={hasSeed ? 'Start from new separate keys' : 'Create new keys'}
        sub={hasSeed
          ? 'Advanced — creates a second backup to protect.'
          : 'Generates a fresh recovery phrase or private key.'}
        disabled={capReached}
        onClick={() => onSource('fresh')}
      />
    </div>
  );

  return (
    <div className="tx-page-scroll">
      <div className="tx-add-choose">
        {capReached && (
          <div className="tx-add-cap-banner">
            <Icon name="alert" size={13} />
            <span>Vault is at the {MAX_ACCOUNTS_PER_VAULT}-account cap. Remove one to add another.</span>
          </div>
        )}

        {hasSeed ? (
          <>
            <div className="tx-card tx-add-hero" style={capReached ? { opacity: 0.5 } : undefined}>
              <div className="reco">
                <span className="kicker">Recommended</span>
                <span className="rule" />
              </div>
              <h3>Next account from your seed phrase</h3>
              <p className="sub">Derived from the phrase you already backed up — nothing new to save.</p>
              <div className="ask">Which runtime?</div>
              <RuntimeCards disabled={capReached} onPick={onDerived} />
            </div>

            <div className="tx-add-more">
              <button
                type="button"
                className={`toggle${moreOpen ? ' open' : ''}`}
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((o) => !o)}
              >
                More ways to add an account
                <span className="chev"><Icon name="chevron-down" size={11} /></span>
              </button>
              {moreOpen && sourceRows}
            </div>
          </>
        ) : (
          <>
            <p className="tx-add-choose-lead">Choose where this account's keys come from.</p>
            {sourceRows}
          </>
        )}
      </div>
    </div>
  );
}

function SourceRow({ title, sub, onClick, disabled }: {
  title:     string;
  sub:       string;
  onClick:   () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="tx-add-source-row" onClick={onClick} disabled={disabled}>
      <span className="spine" />
      <span className="txt">
        <span className="ti">{title}</span>
        <span className="sub-line">{sub}</span>
      </span>
      <Icon name="chevron-right" size={13} />
    </button>
  );
}
