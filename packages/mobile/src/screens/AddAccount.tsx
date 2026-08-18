/**
 * AddAccount — the sequenced add-account wizard: one decision per screen.
 * Stages, kickers and dots all project from the shared AddAccountFlowVM
 * (choose → runtime → input → confirm, with the derived path skipping
 * runtime + input), so the step math can never disagree with the extension's
 * flow. The choose screen routes: with a wallet seed it leads with the derived
 * hero (two taps to a new account) and collapses import / fresh under "More
 * ways"; without a seed it offers the two source rows only. Fresh keys gate
 * Continue behind reveal plus two acknowledgements; imports validate live and
 * surface duplicate detection (the pasted secret's address is derived
 * client-side and compared against the vault); confirm previews the real
 * address before activating.
 */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { newMnemonic } from '@tezosx/wallet-core/shared/seed';
import { randomEvmPrivateKey } from '@tezosx/wallet-core/shared/evm-signing';
import type { AccountKind } from '@tezosx/wallet-core/domain/account';
import { formatError } from '@tezosx/wallet-core/domain/error';
import { shortAddr } from '@tezosx/wallet-core/shared/format';
import { MAX_ACCOUNTS_PER_VAULT, MAX_LABEL_LENGTH } from '@tezosx/wallet-core/shared/constants';
import {
  addAccountFlowVM,
  type AddAccountSourceKind,
  type AddAccountStage,
} from '@tezosx/wallet-core/view-models/add-account-flow-vm';
import { deriveEvmAlias } from '@tezosx/relayer/utils/derive';
import { colors, font, fontSize, radius } from '../theme';
import { Icon } from '../ui/icon';
import { Badge } from '../ui/tx/Badge';
import { Btn } from '../ui/tx/Btn';
import { Check } from '../ui/tx/Check';
import { DiscardOverlay } from '../ui/tx/DiscardOverlay';
import { Dots } from '../ui/tx/Dots';
import { ErrorInline } from '../ui/tx/ErrorInline';
import { Identicon } from '../ui/tx/Identicon';
import { KindCard } from '../ui/tx/KindCard';
import { SourceRow } from '../ui/tx/SourceRow';
import { TopBar } from '../ui/tx/TopBar';
import { useWallet } from '../wallet/context';
import type { ViewAccount } from '../wallet/view-account';
import {
  buildAddAccountSource,
  derivePreviewPrimary,
  derivePrimaryFromImport,
  findDuplicate,
  importShapeValid,
  importWordCount,
  type TzMode,
} from './add-account-helpers';

interface Preview {
  primary: string;
  secondary?: string;
}

export function AddAccount(): React.JSX.Element {
  const ctx = useWallet();

  const [stage, setStage] = useState<AddAccountStage>('choose');
  const [source, setSource] = useState<AddAccountSourceKind | null>(null);
  const [kind, setKind] = useState<AccountKind | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  // Fresh-key input state.
  const [fresh, setFresh] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  // Import input state.
  const [tzMode, setTzMode] = useState<TzMode>('mnemonic');
  const [importVal, setImportVal] = useState('');
  const [duplicate, setDuplicate] = useState<ViewAccount | null>(null);
  const [duplicateAck, setDuplicateAck] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Confirm state.
  const [label, setLabel] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [aliasPending, setAliasPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  const nextSeq = ctx.accounts.length + 1;
  const capReached = ctx.accounts.length >= MAX_ACCOUNTS_PER_VAULT;
  const isCreate = source === 'fresh';
  const isImport = source === 'import';
  const isDerived = source === 'derived';
  const isTezos = kind === 'tezos';

  // The VM only reads `kind` for the input-stage label, by which point it is
  // always set — the placeholder keeps the runtime-stage kicker projectable.
  const vm = addAccountFlowVM(stage, source == null ? null : { kind: kind ?? 'tezos', source });

  // ── Duplicate detection (import input) ────────────────────────────────────
  useEffect(() => {
    if (stage !== 'input' || !isImport || kind == null) return;
    setParseError(null);
    setDuplicate(null);
    setDuplicateAck(false);
    if (importVal.trim() === '') return;
    let cancelled = false;
    void (async () => {
      try {
        const primary = await derivePrimaryFromImport(kind, tzMode, importVal);
        if (cancelled || primary == null) return;
        setDuplicate(findDuplicate(ctx.accounts, primary));
      } catch (e) {
        if (!cancelled) setParseError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [stage, isImport, kind, tzMode, importVal, ctx.accounts]);

  // ── Confirm-screen address preview ────────────────────────────────────────
  useEffect(() => {
    if (stage !== 'confirm' || kind == null || source == null) return;
    setPreview(null);
    setAliasPending(false);
    // A derived account's address comes off the wallet seed, which never
    // leaves the keyring — nothing to derive client-side.
    if (source === 'derived') return;
    let cancelled = false;
    void (async () => {
      try {
        const primary = await derivePreviewPrimary({ kind, source, tzMode, fresh, importRaw: importVal });
        if (cancelled || primary == null) return;
        setPreview({ primary });
        if (kind === 'tezos') {
          setAliasPending(true);
          try {
            const alias = await deriveEvmAlias(primary);
            if (!cancelled) setPreview({ primary, secondary: alias });
          } catch {
            // Offline or RPC lag — the alias shows on Home once it resolves.
          } finally {
            if (!cancelled) setAliasPending(false);
          }
        }
      } catch {
        // The secret was validated on the input stage; leave the preview empty
        // (the CTA stays disabled) rather than crash on an unexpected parse.
      }
    })();
    return () => { cancelled = true; };
  }, [stage, kind, source, tzMode, fresh, importVal]);

  // ── Transitions ───────────────────────────────────────────────────────────

  const startSource = (s: 'fresh' | 'import'): void => {
    if (capReached) return;
    setSource(s);
    setKind(null);
    setStage('runtime');
  };

  const chooseDerived = (k: AccountKind): void => {
    if (capReached) return;
    setSource('derived');
    setKind(k);
    setLabel('');
    setErr(null);
    setStage('confirm');
  };

  const chooseKind = (k: AccountKind): void => {
    setKind(k);
    setRevealed(false);
    setAck1(false);
    setAck2(false);
    setTzMode('mnemonic');
    setImportVal('');
    setDuplicate(null);
    setDuplicateAck(false);
    setParseError(null);
    setLabel('');
    setErr(null);
    // Generate only for the picked kind, on selection — generating both at
    // mount blocked the JS thread and froze the screen.
    setFresh(source === 'fresh' ? (k === 'tezos' ? newMnemonic() : randomEvmPrivateKey()) : '');
    setStage('input');
  };

  const regenerate = (): void => {
    if (kind == null || source !== 'fresh') return;
    setFresh(kind === 'tezos' ? newMnemonic() : randomEvmPrivateKey());
    setRevealed(false);
    setAck1(false);
    setAck2(false);
  };

  // A revealed-but-uncommitted fresh secret exists nowhere else — leaving the
  // input screen must go through an explicit discard.
  const armedDiscard = stage === 'input' && isCreate && revealed;

  const back = (): void => {
    if (stage === 'choose') { ctx.nav.back(); return; }
    if (stage === 'runtime') {
      setSource(null);
      setKind(null);
      setStage('choose');
      return;
    }
    if (stage === 'input') {
      if (armedDiscard) { setDiscardOpen(true); return; }
      setFresh('');
      setStage('runtime');
      return;
    }
    // confirm — a derived pick never had runtime/input stages.
    if (isDerived) {
      setSource(null);
      setKind(null);
      setStage('choose');
      return;
    }
    setRevealed(false);
    setAck1(false);
    setAck2(false);
    setPreview(null);
    setStage('input');
  };

  const confirmDiscard = (): void => {
    setDiscardOpen(false);
    setFresh('');
    setRevealed(false);
    setAck1(false);
    setAck2(false);
    setStage('runtime');
  };

  const switchToExisting = (): void => {
    if (duplicate == null) return;
    ctx.setActive(duplicate.id);
    ctx.nav.reset('home');
  };

  // ── Continue / submit gates ───────────────────────────────────────────────

  const shapeValid = kind != null && importShapeValid(kind, tzMode, importVal);
  const continueOk = isCreate
    ? revealed && ack1 && ack2
    : shapeValid && parseError == null && (duplicate == null || duplicateAck);

  const submit = (): void => {
    if (kind == null || source == null || busy) return;
    setErr(null);
    const name = label.trim() !== '' ? label.trim() : `Account ${nextSeq}`;
    setBusy(true);
    void (async () => {
      try {
        await ctx.addAccount({
          kind,
          source: buildAddAccountSource({ kind, source, tzMode, fresh, importRaw: importVal }),
          label: label.trim() === '' ? undefined : label.trim(),
        });
        // Flow complete — drop the secret-bearing references before leaving.
        setFresh('');
        setImportVal('');
        ctx.toast(`${name} added`);
        ctx.nav.reset('home');
      } catch (e) {
        setErr(e);
        setBusy(false);
      }
    })();
  };

  const ctaLabel = busy
    ? (isDerived ? 'Deriving…' : isCreate ? 'Creating…' : 'Importing…')
    : (isDerived ? 'Derive & activate' : isCreate ? 'Create & activate' : 'Import & activate');
  const formattedErr = err == null ? null : formatError(err);

  const title =
    stage === 'input' ? (isCreate ? 'Secure your keys' : 'Import account')
    : stage === 'confirm' ? 'Review'
    : 'Add account';

  const trimmedImport = importVal.trim();
  const wordCount = isTezos && tzMode === 'mnemonic' && trimmedImport !== ''
    ? importWordCount(trimmedImport)
    : null;
  const validLine = isTezos
    ? (tzMode === 'mnemonic' ? `Valid · ${wordCount ?? 0} words` : 'Valid · edsk')
    : 'Valid · 64 hex chars';
  const invalidLine = isTezos
    ? (tzMode === 'mnemonic'
        ? 'Invalid — expected 12, 15, 18, 21 or 24 words'
        : 'Invalid Tezos secret key')
    : 'Expected 64 hex chars (with or without 0x prefix)';

  const kindCards = (onPick: (k: AccountKind) => void): React.JSX.Element => (
    <View style={styles.kindList}>
      <KindCard
        title="Michelson account"
        detail="tz1 + 0x alias — works in both runtimes."
        accent="purple"
        onPress={() => onPick('tezos')}
      >
        <View style={styles.kindBadgeRow}><Badge variant="purple">Michelson</Badge></View>
      </KindCard>
      <KindCard
        title="EVM account"
        detail="0x address — EVM runtime only."
        accent="cyan"
        onPress={() => onPick('evm')}
      >
        <View style={styles.kindBadgeRow}><Badge variant="cyan">EVM</Badge></View>
      </KindCard>
    </View>
  );

  return (
    <View style={styles.screen}>
      <TopBar
        title={title}
        onBack={back}
        right={
          stage === 'choose' ? (
            <Badge variant={capReached ? 'warning' : 'neutral'} style={styles.capChip}>
              {`${Math.min(nextSeq, MAX_ACCOUNTS_PER_VAULT)}/${MAX_ACCOUNTS_PER_VAULT}`}
            </Badge>
          ) : vm.dots != null ? (
            <View style={styles.dots}><Dots i={vm.dots.i} n={vm.dots.n} /></View>
          ) : undefined
        }
      />

      {stage === 'choose' && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.chooseScroll} showsVerticalScrollIndicator={false}>
          {capReached && (
            <View style={styles.capNotice}>
              <Icon name="alert" size={16} color={colors.warning} />
              <View style={styles.capNoticeBody}>
                <Text style={styles.capNoticeTitle}>Account limit reached</Text>
                <Text style={styles.capNoticeText}>
                  This wallet holds the maximum of {MAX_ACCOUNTS_PER_VAULT} accounts. Remove one before adding another.
                </Text>
              </View>
            </View>
          )}

          {ctx.hasSeed ? (
            <>
              <View style={[styles.hero, capReached && styles.blocked]}>
                <Text style={styles.heroKicker}>Recommended</Text>
                <Text style={styles.heroTitle}>Next account from your seed phrase</Text>
                <Text style={styles.heroSub}>
                  Derived from the phrase you already backed up — nothing new to save.
                </Text>
                <Text style={styles.heroQuestion}>Which runtime?</Text>
                {kindCards(chooseDerived)}
              </View>

              <Pressable
                style={({ pressed }) => [styles.moreHead, pressed && styles.moreHeadPressed]}
                onPress={() => setMoreOpen((v) => !v)}
              >
                <Text style={styles.moreLabel}>More ways to add an account</Text>
                <Icon name={moreOpen ? 'chevron-down' : 'chevron-right'} size={16} color={colors.fgSubtle} />
              </Pressable>
              {moreOpen && (
                <View style={styles.sourceList}>
                  <SourceRow
                    title="Import existing keys"
                    sub="Recovery phrase, edsk key, or 0x private key."
                    disabled={capReached}
                    onPress={() => startSource('import')}
                  />
                  <SourceRow
                    title="Start from new separate keys"
                    sub="Advanced — creates a second backup to protect."
                    disabled={capReached}
                    onPress={() => startSource('fresh')}
                  />
                </View>
              )}
            </>
          ) : (
            <>
              <View style={styles.stepHead}>
                <Text style={styles.stepTitle}>How do you want to add it?</Text>
              </View>
              <View style={styles.sourceList}>
                <SourceRow
                  title="Import existing keys"
                  sub="Recovery phrase, edsk key, or 0x private key."
                  disabled={capReached}
                  onPress={() => startSource('import')}
                />
                <SourceRow
                  title="Create new keys"
                  sub="Generates a fresh recovery phrase or private key."
                  disabled={capReached}
                  onPress={() => startSource('fresh')}
                />
              </View>
            </>
          )}
        </ScrollView>
      )}

      {stage === 'runtime' && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.stageScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.stepHead}>
            {vm.kicker != null && <Text style={styles.kicker}>{vm.kicker}</Text>}
            <Text style={styles.stepTitle}>Which runtime?</Text>
            <Text style={styles.stepSub}>
              {isImport ? 'Pick the runtime your keys belong to.' : 'Pick where the new account lives.'}
            </Text>
          </View>
          {kindCards(chooseKind)}
        </ScrollView>
      )}

      {stage === 'input' && kind != null && (
        <>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.stageScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.stepHead}>
              {vm.kicker != null && <Text style={styles.kicker}>{vm.kicker}</Text>}
              <Text style={styles.stepTitle}>
                {isCreate
                  ? (isTezos ? 'Your recovery phrase' : 'Your private key')
                  : (isTezos ? 'Recovery phrase or edsk' : 'EVM private key')}
              </Text>
            </View>

            {isCreate ? (
              <>
                <View style={styles.secretWrap}>
                  <View style={styles.secretCard}>
                    {isTezos ? (
                      <View style={styles.wordGrid}>
                        {fresh.split(' ').map((w, i) => (
                          <View key={i} style={styles.word}>
                            <Text style={styles.wordN}>{i + 1}</Text>
                            <Text style={styles.wordText}>{w}</Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.secretText}>{'0x' + fresh}</Text>
                    )}
                  </View>
                  {!revealed && (
                    <Pressable style={styles.revealOverlay} onPress={() => setRevealed(true)}>
                      <Icon name="eye" size={28} color={colors.fg} />
                      <Text style={styles.revealTitle}>Tap to reveal</Text>
                      <Text style={styles.revealSub}>Make sure nobody’s looking at your screen.</Text>
                    </Pressable>
                  )}
                </View>

                {revealed && (
                  <>
                    <View style={styles.ackWrap}>
                      <Check checked={ack1} onToggle={setAck1}>
                        I’ll store it offline. Tezos X can’t restore it for me.
                      </Check>
                      <Check checked={ack2} onToggle={setAck2}>
                        Anyone with it can move my funds.
                      </Check>
                    </View>
                    <Pressable
                      style={({ pressed }) => [styles.regenRow, pressed && styles.regenPressed]}
                      onPress={regenerate}
                    >
                      <Icon name="refresh" size={13} color={colors.fgSubtle} />
                      <Text style={styles.regenText}>Regenerate</Text>
                    </Pressable>
                  </>
                )}
              </>
            ) : (
              <>
                {isTezos && (
                  <View style={styles.modeToggle}>
                    <Pressable
                      style={[styles.modeSeg, tzMode === 'mnemonic' && styles.modeSegOn]}
                      onPress={() => { setTzMode('mnemonic'); setImportVal(''); }}
                    >
                      <Text style={[styles.modeSegText, tzMode === 'mnemonic' && styles.modeSegTextOn]}>
                        Recovery phrase
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modeSeg, tzMode === 'edsk' && styles.modeSegOn]}
                      onPress={() => { setTzMode('edsk'); setImportVal(''); }}
                    >
                      <Text style={[styles.modeSegText, tzMode === 'edsk' && styles.modeSegTextOn]}>
                        Private key (edsk)
                      </Text>
                    </Pressable>
                  </View>
                )}

                <TextInput
                  style={styles.importInput}
                  value={importVal}
                  onChangeText={setImportVal}
                  placeholder={isTezos
                    ? (tzMode === 'mnemonic' ? 'whisper kingdom giraffe …' : 'edsk…')
                    : '0xa1c2b3d4…'}
                  placeholderTextColor={colors.fgSubtle}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                  textAlignVertical="top"
                />
                {trimmedImport !== '' && (
                  <View style={styles.metaLine}>
                    <Icon
                      name={shapeValid ? 'check' : 'alert'}
                      size={12}
                      color={shapeValid ? colors.success : colors.danger}
                    />
                    <Text style={[styles.metaText, { color: shapeValid ? colors.success : colors.danger }]}>
                      {shapeValid ? validLine : invalidLine}
                    </Text>
                  </View>
                )}
                {parseError != null && <Text style={styles.parseError}>{parseError}</Text>}
                <Text style={styles.hint}>Your secret never leaves this device.</Text>

                {duplicate != null && (
                  <View style={styles.dupCard}>
                    <View style={styles.dupHead}>
                      <Icon name="alert" size={15} color={colors.warning} />
                      <View style={styles.dupHeadBody}>
                        <Text style={styles.dupTitle}>Already in your wallet</Text>
                        <Text style={styles.dupText}>
                          This {isTezos ? 'phrase' : 'key'} derives an account you’ve already imported.
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dupAccount}>
                      <Identicon seed={duplicate.identitySeed} size={34} ring={duplicate.kind === 'evm' ? 'l2' : 'l1'} />
                      <View style={styles.dupInfo}>
                        <Text style={styles.dupName}>
                          {duplicate.label !== '' ? duplicate.label : 'Existing account'}
                        </Text>
                        <Text style={styles.dupAddr}>
                          {shortAddr(duplicate.tz1 ?? duplicate.address ?? '')}
                          {duplicate.evmAlias != null && duplicate.evmAlias !== ''
                            ? ` · ${shortAddr(duplicate.evmAlias)}`
                            : ''}
                        </Text>
                      </View>
                      <Btn variant="outline" size="xs" onPress={switchToExisting}>Switch to it</Btn>
                    </View>
                    <Check checked={duplicateAck} onToggle={setDuplicateAck}>
                      Add it again anyway — I’ll use it under a different label.
                    </Check>
                  </View>
                )}
              </>
            )}
          </ScrollView>
          <View style={styles.actionBar}>
            <Btn
              variant={isTezos ? 'accent' : 'accent-cyan'}
              full
              disabled={!continueOk}
              onPress={() => { setErr(null); setStage('confirm'); }}
            >
              Continue
            </Btn>
          </View>
        </>
      )}

      {stage === 'confirm' && kind != null && source != null && (
        <>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.stageScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.stepHead}>
              {vm.kicker != null && <Text style={styles.kicker}>{vm.kicker}</Text>}
              <Text style={styles.stepTitle}>
                {isDerived ? 'Next account from your seed phrase'
                  : isCreate ? 'Your new account'
                  : `Importing this ${isTezos ? 'Michelson' : 'EVM'} account`}
              </Text>
              <Text style={styles.stepSub}>
                Type a label or leave blank for the default. The account becomes active when you confirm.
              </Text>
            </View>

            <View style={styles.confirmCard}>
              <View style={styles.confirmHead}>
                <Identicon
                  seed={preview?.primary ?? `new-${kind}`}
                  size={44}
                  ring={isTezos ? 'l1' : 'l2'}
                />
                <View style={styles.confirmId}>
                  <TextInput
                    style={styles.nameInput}
                    value={label}
                    maxLength={MAX_LABEL_LENGTH}
                    placeholder={`Account ${nextSeq}`}
                    placeholderTextColor={colors.fgSubtle}
                    onChangeText={setLabel}
                  />
                  <Text style={styles.kindLine}>
                    {isTezos ? 'Michelson runtime · tz1 + 0x alias' : 'EVM runtime · 0x'}
                  </Text>
                </View>
              </View>

              <View style={styles.addrList}>
                {isDerived ? (
                  <View style={styles.addrRow}>
                    <Badge variant={isTezos ? 'purple' : 'cyan'}>{isTezos ? 'Michelson' : 'EVM'}</Badge>
                    <Text style={styles.addrNote}>Next unused index from your seed phrase</Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.addrRow}>
                      <Badge variant={isTezos ? 'purple' : 'cyan'}>{isTezos ? 'Michelson' : 'EVM'}</Badge>
                      {preview != null ? (
                        <Text style={styles.addrValue}>{shortAddr(preview.primary, 8, 6)}</Text>
                      ) : (
                        <Text style={styles.addrNote}>Deriving…</Text>
                      )}
                    </View>
                    {isTezos && (
                      <View style={styles.addrRow}>
                        <Badge variant="cyan">EVM</Badge>
                        {preview?.secondary != null ? (
                          <Text style={styles.addrValue}>{shortAddr(preview.secondary, 8, 6)}</Text>
                        ) : (
                          <Text style={styles.addrNote}>
                            {aliasPending ? 'Resolving alias…' : 'Shown on Home after adding'}
                          </Text>
                        )}
                      </View>
                    )}
                  </>
                )}
              </View>
            </View>

            <View style={styles.noteCard}>
              <Icon name="info" size={14} color={colors.fgMuted} />
              <Text style={styles.noteText}>
                {isDerived
                  ? 'Backed up by your existing seed phrase — nothing new to save. The account activates immediately.'
                  : 'This account is activated immediately. Connected dApps see the new address on their next request.'}
              </Text>
            </View>

            {formattedErr != null && (
              <View style={styles.confirmErr}>
                <ErrorInline title={formattedErr.title} detail={formattedErr.detail} />
              </View>
            )}
          </ScrollView>
          <View style={styles.actionBar}>
            <Btn
              variant={isTezos ? 'accent' : 'accent-cyan'}
              full
              disabled={busy || (!isDerived && preview == null)}
              onPress={submit}
            >
              {ctaLabel}
            </Btn>
          </View>
        </>
      )}

      {discardOpen && <DiscardOverlay onStay={() => setDiscardOpen(false)} onDiscard={confirmDiscard} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  dots: { paddingRight: 8 },
  capChip: { marginRight: 8 },
  scroll: { flex: 1 },
  chooseScroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  stageScroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },

  kicker: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.fgSubtle,
    fontWeight: '600',
  },
  stepHead: { paddingHorizontal: 4, paddingBottom: 16, gap: 6 },
  stepTitle: { fontSize: fontSize['2xl'], fontWeight: '600', letterSpacing: -0.36, color: colors.fg },
  stepSub: { fontSize: fontSize.sm, color: colors.fgMuted, lineHeight: 20 },

  capNotice: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: 'rgba(255,184,76,0.35)',
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 14,
  },
  capNoticeBody: { flex: 1, minWidth: 0, gap: 2 },
  capNoticeTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.warning },
  capNoticeText: { fontSize: fontSize.xs, color: colors.fgMuted, lineHeight: 17 },
  blocked: { opacity: 0.45 },

  hero: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.purpleLine,
    borderRadius: radius.xl,
    padding: 18,
    gap: 6,
  },
  heroKicker: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.purpleText,
    fontWeight: '600',
  },
  heroTitle: { fontSize: fontSize.xl, fontWeight: '600', letterSpacing: -0.3, color: colors.fg },
  heroSub: { fontSize: fontSize.sm, color: colors.fgMuted, lineHeight: 20 },
  heroQuestion: { fontSize: fontSize.sm, fontWeight: '600', color: colors.fg, marginTop: 10, marginBottom: 4 },
  kindList: { gap: 10 },
  kindBadgeRow: { flexDirection: 'row' },

  moreHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 14,
    marginTop: 10,
  },
  moreHeadPressed: { opacity: 0.7 },
  moreLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.fgMuted },
  sourceList: { gap: 10 },

  secretWrap: { position: 'relative' },
  secretCard: { backgroundColor: colors.surface2, borderRadius: radius.lg, padding: 16, minHeight: 96 },
  secretText: { fontFamily: font.mono, fontSize: fontSize.sm, color: colors.fg, lineHeight: 23 },
  wordGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  word: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  wordN: { fontSize: 10, color: colors.fgSubtle, fontVariant: ['tabular-nums'] },
  wordText: { fontFamily: font.mono, fontSize: fontSize.xs, color: colors.fg },
  revealOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(11,11,18,0.9)',
    borderRadius: radius.lg,
    paddingHorizontal: 20,
  },
  revealTitle: { fontWeight: '600', color: colors.fg, fontSize: fontSize.md },
  revealSub: { fontSize: fontSize.xs, color: colors.fgMuted, textAlign: 'center' },
  ackWrap: { marginTop: 18, gap: 10 },
  regenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 8,
  },
  regenPressed: { opacity: 0.6 },
  regenText: { fontSize: fontSize.xs, color: colors.fgSubtle, fontWeight: '600' },

  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    padding: 3,
    marginBottom: 12,
  },
  modeSeg: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  modeSegOn: { backgroundColor: colors.surface3 },
  modeSegText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.fgSubtle },
  modeSegTextOn: { color: colors.fg },

  importInput: {
    height: 110,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.md,
    color: colors.fg,
    fontFamily: font.mono,
    fontSize: fontSize.sm,
    paddingHorizontal: 16,
    paddingVertical: 14,
    lineHeight: 22,
  },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  metaText: { fontSize: fontSize.xs, fontWeight: '500' },
  parseError: { fontSize: fontSize.xs, color: colors.danger, marginTop: 6 },
  hint: { fontSize: fontSize.xs, color: colors.fgSubtle, marginTop: 8 },

  dupCard: {
    marginTop: 16,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: 'rgba(255,184,76,0.35)',
    borderRadius: radius.lg,
    padding: 14,
    gap: 12,
  },
  dupHead: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dupHeadBody: { flex: 1, minWidth: 0, gap: 2 },
  dupTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.warning },
  dupText: { fontSize: fontSize.xs, color: colors.fgMuted, lineHeight: 17 },
  dupAccount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 10,
  },
  dupInfo: { flex: 1, minWidth: 0, gap: 1 },
  dupName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.fg },
  dupAddr: { fontSize: fontSize.xs, color: colors.fgMuted, fontFamily: font.mono },

  confirmCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 16,
    gap: 14,
  },
  confirmHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  confirmId: { flex: 1, minWidth: 0, gap: 4 },
  nameInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.sm,
    color: colors.fg,
    fontSize: fontSize.md,
    fontWeight: '600',
    height: 42,
    paddingHorizontal: 12,
  },
  kindLine: { fontSize: fontSize.xs, color: colors.fgMuted },
  addrList: { gap: 8 },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addrValue: {
    flexShrink: 1,
    fontFamily: font.mono,
    fontSize: fontSize.sm,
    color: colors.fg,
    fontVariant: ['tabular-nums'],
  },
  addrNote: { flexShrink: 1, fontSize: fontSize.sm, color: colors.fgMuted },

  noteCard: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 12,
  },
  noteText: { flex: 1, fontSize: fontSize.xs, color: colors.fgMuted, lineHeight: 18 },
  confirmErr: { marginTop: 12 },

  actionBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 42,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    gap: 10,
  },
});
