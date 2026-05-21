import type { AccountSummary } from '@/shared/messages';
import { CreatePane } from './CreatePane';
import { ImportPane } from './ImportPane';
import { stageHeadline } from './helpers';
import type { Pick, TzMode } from './types';

export interface InputStepProps {
  pick:           Pick;
  tzMnemonic:     string | null;
  evmPrivkey:     string | null;
  revealed:       boolean; setRevealed: (b: boolean) => void;
  ack1:           boolean; setAck1: (b: boolean) => void;
  ack2:           boolean; setAck2: (b: boolean) => void;
  regenerate:     () => void;
  tzMode:         TzMode; setTzMode: (m: TzMode) => void;
  tzImportValue:  string; setTzImportValue: (s: string) => void;
  evmImportValue: string; setEvmImportValue: (s: string) => void;
  duplicate:      AccountSummary | null;
  duplicateAck:   boolean; setDuplicateAck: (b: boolean) => void;
  parseError:     string | null;
  onSwitchToExisting: () => void;
  onContinue:     () => void;
  onBack:         () => void;
  continueOk:     boolean;
}

export function InputStep(props: InputStepProps) {
  const { pick, onContinue, onBack, continueOk } = props;
  const isCreate = pick.source === 'fresh';
  const isTezos  = pick.kind === 'tezos';
  const primaryClass = `btn primary${isTezos ? '' : ' l2'}`;

  return (
    <>
      <div className="tx-page-scroll">
        <div className="tx-add-step-head" style={{ paddingBottom: 8 }}>
          <div className="kicker">
            Step 2 of 3 · {isCreate ? `Save your ${isTezos ? 'phrase' : 'key'}` : 'Paste a secret'}
          </div>
          <h2>{stageHeadline(pick)}</h2>
          {isCreate && (
            <p className="sub">
              {isTezos
                ? "Write it down somewhere offline. Anyone with these words owns this account — TezosX can't recover it."
                : '256 bits as a 64-character hex string. Anyone with it owns this account.'}
            </p>
          )}
        </div>

        {isCreate
          ? <CreatePane {...props} />
          : <ImportPane {...props} />}
      </div>

      <div className="tx-add-actbar">
        <button type="button" className="btn ghost" onClick={onBack}>Back</button>
        <button
          type="button"
          className={primaryClass}
          onClick={onContinue}
          disabled={!continueOk}
        >
          Continue
        </button>
      </div>
    </>
  );
}
