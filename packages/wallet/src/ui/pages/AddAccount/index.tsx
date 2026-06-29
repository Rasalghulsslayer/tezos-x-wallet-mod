/**
 * AddAccount — 3-step flow orchestrator:
 *   pick → input (CreatePane | ImportPane) → confirm
 *
 * Discard overlay intercepts Back/Close mid-Create with revealed-but-uncommitted
 * fresh secret. Each step + its sub-pieces live in their own file under this folder.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VaultState, AccountSummary } from '@tezosx/wallet-core/shared/messages';
import type { AddAccountSource, AccountId } from '@tezosx/wallet-core/domain/account';
import { newMnemonic, deriveTezosIdentity, deriveTezosIdentityFromSecretKey } from '@tezosx/wallet-core/shared/seed';
import { deriveEvmAccount, normaliseEvmPrivateKey, randomEvmPrivateKey } from '@tezosx/wallet-core/shared/evm-signing';
import { deriveEvmAlias } from '@tezosx/relayer/utils/derive';
import { isValidEdsk, isValidMnemonic } from '@tezosx/wallet-core/domain/validation';
import { sendPopupRequest } from '@/shared/messaging';
import { formatError } from '@tezosx/wallet-core/domain/error';
import { MAX_ACCOUNTS_PER_VAULT } from '@tezosx/wallet-core/shared/constants';
import { toast } from '../../tx/Toast';

import { AddAccountTopBar } from './AddAccountTopBar';
import { PickStep } from './PickStep';
import { InputStep } from './InputStep';
import { ConfirmStep } from './ConfirmStep';
import { DiscardOverlay } from './DiscardOverlay';
import { stageTitle } from './helpers';
import { STAGES, type Pick, type Preview, type Stage, type TzMode } from './types';

export function AddAccount({ state, onChanged }: { state: VaultState; onChanged: () => void }) {
  const navigate = useNavigate();

  const [stage, setStage] = useState<Stage>('pick');
  const [pick,  setPick]  = useState<Pick | null>(null);

  // Fresh secrets — generated lazily on input stage entry.
  const [tzMnemonic, setTzMnemonic] = useState<string | null>(null);
  const [evmPrivkey, setEvmPrivkey] = useState<string | null>(null);

  // Import inputs.
  const [tzMode,        setTzMode]         = useState<TzMode>('mnemonic');
  const [tzImportValue, setTzImportValue]  = useState('');
  const [evmImportValue, setEvmImportValue] = useState('');

  // Reveal acks.
  const [revealed, setRevealed] = useState(false);
  const [ack1,     setAck1]     = useState(false);
  const [ack2,     setAck2]     = useState(false);

  // Duplicate detection (computed during input stage).
  const [duplicate,    setDuplicate]    = useState<AccountSummary | null>(null);
  const [duplicateAck, setDuplicateAck] = useState(false);
  const [parseError,   setParseError]   = useState<string | null>(null);

  // Confirm-stage preview.
  const [preview,     setPreview]     = useState<Preview | null>(null);
  const [label,       setLabel]       = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  // Discard overlay (intercepts back/close when fresh secret revealed but not committed).
  const [discardOpen, setDiscardOpen] = useState(false);

  const sortedAccounts = useMemo(
    () => (state.status === 'unlocked'
      ? state.accounts.slice().sort((a, b) => a.createdAt - b.createdAt)
      : []),
    [state],
  );
  const nextSeq = sortedAccounts.length + 1;

  const stageIdx = STAGES.indexOf(stage);
  const isCreate = pick?.source === 'fresh';
  const isImport = pick?.source === 'import';
  const isTezos  = pick?.kind === 'tezos';

  // ── Stage entry side-effects ──────────────────────────────────────────────

  useEffect(() => {
    if (stage !== 'input' || !isCreate || pick == null) return;
    if (pick.kind === 'tezos' && tzMnemonic == null) {
      setTzMnemonic(newMnemonic());
    } else if (pick.kind === 'evm' && evmPrivkey == null) {
      setEvmPrivkey(randomEvmPrivateKey());
    }
  }, [stage, isCreate, pick, tzMnemonic, evmPrivkey]);

  useEffect(() => {
    if (stage === 'input') {
      setRevealed(false);
      setAck1(false);
      setAck2(false);
    }
  }, [stage, pick]);

  useEffect(() => {
    if (stage !== 'input' || !isImport || pick == null) return;
    setParseError(null);
    setDuplicate(null);
    setDuplicateAck(false);

    const trimmed = pick.kind === 'tezos' ? tzImportValue.trim() : evmImportValue.trim();
    if (trimmed === '') return;

    let cancelled = false;
    void (async () => {
      try {
        let derivedPrimary: string | null = null;
        if (pick.kind === 'tezos') {
          if (tzMode === 'mnemonic') {
            if (!isValidMnemonic(trimmed.toLowerCase())) return;
            derivedPrimary = (await deriveTezosIdentity(trimmed.toLowerCase())).tz1;
          } else {
            if (!isValidEdsk(trimmed)) return;
            derivedPrimary = (await deriveTezosIdentityFromSecretKey(trimmed)).tz1;
          }
        } else {
          const norm = normaliseEvmPrivateKey(trimmed);
          derivedPrimary = deriveEvmAccount(norm).address;
        }
        if (cancelled || derivedPrimary == null) return;
        const match = sortedAccounts.find((a) =>
          a.primaryAddress.toLowerCase() === (derivedPrimary as string).toLowerCase(),
        );
        if (match != null) setDuplicate(match);
      } catch (e) {
        if (!cancelled) setParseError((e as Error).message);
      }
    })();

    return () => { cancelled = true; };
  }, [stage, isImport, pick, tzMode, tzImportValue, evmImportValue, sortedAccounts]);

  useEffect(() => {
    if (stage !== 'confirm' || pick == null) return;
    let cancelled = false;
    void (async () => {
      try {
        if (pick.kind === 'tezos') {
          const secret = isCreate
            ? (tzMnemonic ?? '')
            : (tzImportValue.trim().toLowerCase());
          const { tz1 } = isCreate || tzMode === 'mnemonic'
            ? await deriveTezosIdentity(isCreate ? secret : tzImportValue.trim().toLowerCase())
            : await deriveTezosIdentityFromSecretKey(tzImportValue.trim());
          const alias = await deriveEvmAlias(tz1);
          if (!cancelled) setPreview({ primary: tz1, secondary: alias });
        } else {
          const priv = isCreate
            ? (evmPrivkey ?? '')
            : normaliseEvmPrivateKey(evmImportValue.trim());
          const { address } = deriveEvmAccount(priv);
          if (!cancelled) setPreview({ primary: address });
        }
      } catch (e) {
        if (!cancelled) setPreview(null);
        console.error('[AddAccount] preview derivation failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [stage, pick, isCreate, tzMnemonic, evmPrivkey, tzImportValue, evmImportValue, tzMode]);

  // ── Navigation ──────────────────────────────────────────────────────────────

  const armedDiscard = stage === 'input' && isCreate && revealed;

  const tryBack = () => {
    if (stage === 'pick') { navigate(-1); return; }
    if (armedDiscard)     { setDiscardOpen(true); return; }
    if (stage === 'input')   setStage('pick');
    else if (stage === 'confirm') setStage('input');
  };

  const confirmDiscard = () => {
    setDiscardOpen(false);
    setTzMnemonic(null);
    setEvmPrivkey(null);
    setRevealed(false);
    setAck1(false);
    setAck2(false);
    setStage('pick');
  };

  // ── Transitions ─────────────────────────────────────────────────────────────

  const choosePick = (next: Pick) => {
    setPick(next);
    setLabel('');
    setStage('input');
  };

  const goToConfirm = () => setStage('confirm');

  const regenerate = () => {
    if (pick == null || !isCreate) return;
    if (pick.kind === 'tezos') setTzMnemonic(newMnemonic());
    else                       setEvmPrivkey(randomEvmPrivateKey());
    setRevealed(false);
    setAck1(false);
    setAck2(false);
  };

  // ── Submit / Switch-to-existing ─────────────────────────────────────────────

  const submit = async () => {
    if (pick == null) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const trimmedLabel = label.trim();
      const src: AddAccountSource = isCreate
        ? { source: 'fresh' }
        : pick.kind === 'tezos'
          ? tzMode === 'mnemonic'
            ? { source: 'mnemonic', mnemonic: tzImportValue.trim().toLowerCase() }
            : { source: 'edsk', edsk: tzImportValue.trim() }
          : { source: 'privkey', privateKey: normaliseEvmPrivateKey(evmImportValue.trim()) };

      const { accountId } = await sendPopupRequest<{ accountId: AccountId }>({
        type:   'ADD_ACCOUNT',
        kind:   pick.kind,
        source: src,
        label:  trimmedLabel === '' ? undefined : trimmedLabel,
      });
      await sendPopupRequest({ type: 'SET_ACTIVE_ACCOUNT', accountId });
      toast(`${trimmedLabel === '' ? `Account ${nextSeq}` : trimmedLabel} added`);
      onChanged();
      navigate('/', { replace: true });
    } catch (e) {
      setSubmitError(e);
      setSubmitting(false);
    }
  };

  const switchToExisting = async () => {
    if (duplicate == null) return;
    try {
      await sendPopupRequest({ type: 'SET_ACTIVE_ACCOUNT', accountId: duplicate.id });
      onChanged();
      navigate('/', { replace: true });
    } catch (e) {
      toast(`Switch failed: ${formatError(e).title}`);
    }
  };

  // ── Continue-button enable rules ────────────────────────────────────────────

  const acksComplete = isCreate ? (revealed && ack1 && ack2) : true;

  const importTrimmed = isTezos ? tzImportValue.trim() : evmImportValue.trim();
  const importShapeValid = isImport
    ? (isTezos
        ? (tzMode === 'mnemonic'
            ? isValidMnemonic(importTrimmed.toLowerCase())
            : isValidEdsk(importTrimmed))
        : importTrimmed.length >= 64 && (parseError == null))
    : false;
  const importContinueOk = isImport
    && importShapeValid
    && parseError == null
    && (duplicate == null || duplicateAck);

  const continueOk = isCreate ? acksComplete : importContinueOk;
  const capReached = sortedAccounts.length >= MAX_ACCOUNTS_PER_VAULT;

  if (state.status !== 'unlocked') return null;

  return (
    <div className="tx-page" style={{ position: 'relative' }}>
      <AddAccountTopBar
        title={stageTitle(stage, pick)}
        onBack={tryBack}
        onClose={tryBack}
        stageIdx={stageIdx}
        capN={sortedAccounts.length}
        capMax={MAX_ACCOUNTS_PER_VAULT}
        showCap={stage === 'pick'}
      />

      {stage === 'pick' && (
        <PickStep capReached={capReached} onChoose={choosePick} />
      )}

      {stage === 'input' && pick != null && (
        <InputStep
          pick={pick}
          tzMnemonic={tzMnemonic}
          evmPrivkey={evmPrivkey}
          revealed={revealed} setRevealed={setRevealed}
          ack1={ack1} setAck1={setAck1}
          ack2={ack2} setAck2={setAck2}
          regenerate={regenerate}
          tzMode={tzMode} setTzMode={(m) => { setTzMode(m); setTzImportValue(''); }}
          tzImportValue={tzImportValue} setTzImportValue={setTzImportValue}
          evmImportValue={evmImportValue} setEvmImportValue={setEvmImportValue}
          duplicate={duplicate} duplicateAck={duplicateAck} setDuplicateAck={setDuplicateAck}
          parseError={parseError}
          onSwitchToExisting={() => void switchToExisting()}
          onContinue={goToConfirm}
          onBack={tryBack}
          continueOk={continueOk}
        />
      )}

      {stage === 'confirm' && pick != null && (
        <ConfirmStep
          pick={pick}
          preview={preview}
          nextSeq={nextSeq}
          label={label} setLabel={setLabel}
          submitting={submitting}
          submitError={submitError}
          onBack={tryBack}
          onSubmit={() => void submit()}
        />
      )}

      {discardOpen && (
        <DiscardOverlay
          onStay={() => setDiscardOpen(false)}
          onDiscard={confirmDiscard}
        />
      )}
    </div>
  );
}
