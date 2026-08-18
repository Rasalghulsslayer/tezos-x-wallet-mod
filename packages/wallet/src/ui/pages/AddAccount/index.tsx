/**
 * AddAccount — one-decision-per-screen wizard:
 *   choose → [runtime → input (CreatePane | ImportPane)] → confirm
 * The derived path skips runtime+input (the choose screen's hero already
 * carries the runtime, and there is no secret to show or paste). Step kickers
 * and dots project from the core flow VM — never computed here.
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

import { addAccountFlowVM } from '@tezosx/wallet-core/view-models/add-account-flow-vm';
import { AddAccountTopBar } from './AddAccountTopBar';
import { ChooseStep } from './ChooseStep';
import { RuntimeStep } from './RuntimeStep';
import { InputStep } from './InputStep';
import { ConfirmStep } from './ConfirmStep';
import { DiscardOverlay } from './DiscardOverlay';
import { stageTitle } from './helpers';
import type { Kind, Pick, Preview, Stage, TzMode } from './types';

export function AddAccount({ state, onChanged }: { state: VaultState; onChanged: () => void }) {
  const navigate = useNavigate();

  const [stage, setStage] = useState<Stage>('choose');
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

  const vm       = addAccountFlowVM(stage, pick);
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
    // A derived account's address comes off the wallet seed, which never
    // leaves the service worker — there is nothing to derive client-side.
    // ConfirmStep explains the derivation instead of previewing an address.
    if (pick.source === 'derived') { setPreview(null); return; }
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
    if (stage === 'choose') { navigate(-1); return; }
    if (armedDiscard)       { setDiscardOpen(true); return; }
    if (stage === 'runtime')      setStage('choose');
    else if (stage === 'input')   setStage('runtime');
    // A derived pick never had a runtime or input stage — back out of confirm
    // returns straight to the choose screen.
    else if (stage === 'confirm') setStage(pick?.source === 'derived' ? 'choose' : 'input');
  };

  const confirmDiscard = () => {
    setDiscardOpen(false);
    setTzMnemonic(null);
    setEvmPrivkey(null);
    setRevealed(false);
    setAck1(false);
    setAck2(false);
    setStage('runtime');
  };

  // ── Transitions ─────────────────────────────────────────────────────────────

  // The hero's runtime cards commit the whole pick at once: derived accounts
  // have no secret to reveal or paste, so they jump straight to confirm.
  const chooseDerived = (kind: Kind) => {
    setPick({ kind, source: 'derived' });
    setLabel('');
    setStage('confirm');
  };

  // A source row only decides *how* the key arrives; the runtime screen picks
  // the kind next. The placeholder kind is never read before it does — the
  // flow VM only looks at `source` until the input stage.
  const chooseSource = (source: 'import' | 'fresh') => {
    setPick({ kind: 'tezos', source });
    setLabel('');
    setStage('runtime');
  };

  const chooseRuntime = (kind: Kind) => {
    setPick((p) => (p == null ? p : { ...p, kind }));
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
      // The secret the user revealed and acknowledged is the one persisted —
      // pass it explicitly. 'fresh' would make the keyring mint a different
      // key than the one the user just backed up.
      let src: AddAccountSource;
      if (pick.source === 'derived') {
        src = { source: 'derived' };
      } else if (isCreate) {
        if (pick.kind === 'tezos') {
          if (tzMnemonic == null) throw new Error('No mnemonic was generated');
          src = { source: 'mnemonic', mnemonic: tzMnemonic };
        } else {
          if (evmPrivkey == null) throw new Error('No private key was generated');
          src = { source: 'privkey', privateKey: evmPrivkey };
        }
      } else {
        src = pick.kind === 'tezos'
          ? tzMode === 'mnemonic'
            ? { source: 'mnemonic', mnemonic: tzImportValue.trim().toLowerCase() }
            : { source: 'edsk', edsk: tzImportValue.trim() }
          : { source: 'privkey', privateKey: normaliseEvmPrivateKey(evmImportValue.trim()) };
      }

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
        dots={vm.dots}
        capN={sortedAccounts.length}
        capMax={MAX_ACCOUNTS_PER_VAULT}
        showCap={stage === 'choose'}
      />

      {stage === 'choose' && (
        <ChooseStep
          capReached={capReached}
          hasSeed={state.hasSeed === true}
          onDerived={chooseDerived}
          onSource={chooseSource}
        />
      )}

      {stage === 'runtime' && (
        <RuntimeStep kicker={vm.kicker} onPick={chooseRuntime} />
      )}

      {stage === 'input' && pick != null && (
        <InputStep
          pick={pick}
          kicker={vm.kicker}
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
          kicker={vm.kicker}
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
