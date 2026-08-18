import type { AccountSummary } from '@tezosx/wallet-core/shared/messages';
import { CreatePane } from './CreatePane';
import { ImportPane } from './ImportPane';
import { StepHead } from './StepHead';
import { stageHeadline } from './helpers';
import type { Pick, TzMode } from './types';

export interface InputStepProps {
  pick:           Pick;
  kicker:         string | null;
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
  const { pick, kicker, onContinue, onBack, continueOk } = props;
  const isCreate = pick.source === 'fresh';
  const isTezos  = pick.kind === 'tezos';
  const primaryClass = `btn primary${isTezos ? '' : ' l2'}`;

  return (
    <>
      <div className="tx-page-scroll">
        <StepHead
          icon={isCreate ? (isTezos ? 'seed' : 'key') : 'paste'}
          accent={isTezos ? 'purple' : 'cyan'}
          kicker={kicker}
          title={stageHeadline(pick)}
          sub={isCreate
            ? (isTezos
                ? "Write it down somewhere offline. Anyone with these words owns this account — Tezos X can't recover it."
                : '256 bits as a 64-character hex string. Anyone with it owns this account.')
            : undefined}
        />

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
