import { MAX_LABEL_LENGTH } from '@tezosx/wallet-core/shared/constants';
import { formatError } from '@tezosx/wallet-core/domain/error';
import { shortAddr } from '@tezosx/wallet-core/shared/format';
import { Identicon } from '../../tx/Identicon';
import { Icon } from '../../tx/Icon';
import { EVM_LABEL_CHIPS, TEZOS_LABEL_CHIPS, type Pick, type Preview } from './types';

export function ConfirmStep({
  pick, preview, nextSeq, label, setLabel,
  submitting, submitError, onBack, onSubmit,
}: {
  pick:        Pick;
  preview:     Preview | null;
  nextSeq:     number;
  label:       string; setLabel: (s: string) => void;
  submitting:  boolean;
  submitError: unknown;
  onBack:      () => void;
  onSubmit:    () => void;
}) {
  const isTezos   = pick.kind === 'tezos';
  const isCreate  = pick.source === 'fresh';
  const isDerived = pick.source === 'derived';
  const chips    = isTezos ? TEZOS_LABEL_CHIPS : EVM_LABEL_CHIPS;
  const placeholder  = `Account ${nextSeq} · tap to label`;
  const primaryLabel = submitting
    ? (isDerived ? 'Deriving…' : isCreate ? 'Creating…' : 'Importing…')
    : (isDerived ? 'Derive & activate' : isCreate ? 'Create & activate' : 'Import & activate');
  const primaryClass = `btn primary${isTezos ? '' : ' l2'}`;

  return (
    <>
      <div className="tx-page-scroll">
        <div className="tx-add-step-head" style={{ paddingBottom: 8 }}>
          <div className="kicker">{isDerived ? 'Step 2 of 2 · Review' : 'Step 3 of 3 · Review'}</div>
          <h2>
            {isDerived ? 'Next account from your seed phrase'
              : isCreate ? 'Your new account'
              : `Importing this ${isTezos ? 'Tezos' : 'EVM'} account`}
          </h2>
          <p className="sub">Type a label or leave blank for the default. The account becomes active when you confirm.</p>
        </div>

        <div className={`tx-add-preview-card ${isTezos ? 'tezos' : 'evm'}`}>
          <div className="ah-top">
            <div className={`ah-ident ${isTezos ? 'tezos' : 'evm'}`}>
              <Identicon seed={preview?.primary ?? ''} />
            </div>
            <div className="ah-id">
              <input
                className={`nm-input${isTezos ? '' : ' l2'}`}
                value={label}
                maxLength={MAX_LABEL_LENGTH}
                placeholder={placeholder}
                onChange={(e) => setLabel(e.target.value)}
              />
              <div className="kind">
                <span className={`sw ${isTezos ? 'both' : 'l2'}`} aria-hidden />
                {isTezos ? 'Tezos · dual runtime' : 'EVM-native'} · {isDerived ? 'DERIVED' : isCreate ? 'NEW' : 'IMPORT'}
              </div>
            </div>
          </div>
          <div className="ah-addrs">
            {isTezos && preview?.primary != null && (
              <>
                <div className="ah-addr">
                  <span className="badge l1">Michelson</span>
                  <span className="v">{shortAddr(preview.primary, 8, 6)}</span>
                </div>
                {preview.secondary != null && (
                  <div className="ah-addr">
                    <span className="badge l2">EVM</span>
                    <span className="v">{shortAddr(preview.secondary, 8, 6)}</span>
                  </div>
                )}
              </>
            )}
            {!isTezos && preview?.primary != null && (
              <div className="ah-addr">
                <span className="badge l2">EVM</span>
                <span className="v">{shortAddr(preview.primary, 8, 6)}</span>
              </div>
            )}
            {preview == null && isDerived && (
              // The wallet seed never leaves the service worker, so the next
              // index's address can't be previewed here — it appears on Home
              // right after the derivation lands.
              <div className="ah-addr">
                <span className={`badge ${isTezos ? 'l1' : 'l2'}`}>{isTezos ? 'Michelson' : 'EVM'}</span>
                <span className="v">Next unused index from your seed phrase</span>
              </div>
            )}
            {preview == null && !isDerived && (
              <div className="ah-addr"><span className="badge l1">…</span><span className="v">Deriving…</span></div>
            )}
          </div>
        </div>

        <div className="tx-add-label-suggest">
          {chips.map((c) => (
            <button type="button" key={c} className="chip" onClick={() => setLabel(c)}>{c}</button>
          ))}
        </div>

        <div className="tx-add-confirm-note">
          <span className="ico"><Icon name="info" size={13} /></span>
          {label.trim() !== '' ? (
            <span>Will appear as <strong>"{label.trim()}"</strong> on Home. You can rename later from the switcher.</span>
          ) : isDerived ? (
            <span>Backed up by your <strong>existing seed phrase</strong> — nothing new to save. The account activates immediately.</span>
          ) : (
            <span>This account will be created and <strong>activated immediately</strong>. Connected dApps will see the new address on their next request.</span>
          )}
        </div>

        {submitError != null && (
          <div style={{ margin: '0 16px 12px', color: 'var(--tx-danger)', fontSize: 12 }}>
            {formatError(submitError).title}
          </div>
        )}
      </div>

      <div className="tx-add-actbar">
        <button type="button" className="btn ghost" onClick={onBack} disabled={submitting}>Back</button>
        <button
          type="button"
          className={primaryClass}
          onClick={onSubmit}
          disabled={submitting || (!isDerived && preview == null)}
        >
          {primaryLabel}
        </button>
      </div>
    </>
  );
}
