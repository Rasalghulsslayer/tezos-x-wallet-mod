/**
 * Create — the stepped new-wallet flow (mirrors the design's CreateScreen). Four
 * stages for Tezos (intro → reveal → confirm → password) and three for EVM
 * (intro → confirm → password), tracked by `stage` with Dots for progress. The
 * intro gates on two acknowledgements; reveal shows a blurred seed grid the user
 * taps to unveil; confirm verifies three seed positions (Tezos) or displays the
 * generated private key (EVM); password sets the vault password. Mock secrets
 * only — finishOnboarding hands control back to the shell on the fixed acc id.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { newMnemonic, pickConfirmPositions } from '@tezosx/wallet-core/shared/seed';
import { randomEvmPrivateKey } from '@tezosx/wallet-core/shared/evm-signing';
import { formatError } from '@tezosx/wallet-core/domain/error';
import { colors, fontSize, font, radius, space } from '../theme';
import { useWallet } from '../wallet/context';
import { Btn } from '../ui/tx/Btn';
import { Check } from '../ui/tx/Check';
import { Dots } from '../ui/tx/Dots';
import { ErrorInline } from '../ui/tx/ErrorInline';
import { Icon } from '../ui/icon';
import { TopBar } from '../ui/tx/TopBar';

type Stage = 'intro' | 'reveal' | 'confirm' | 'password';

export function Create({ params }: { params: Record<string, unknown> }): React.JSX.Element {
  const ctx = useWallet();
  const isEvm = params.kind === 'evm';

  // Single source of truth for the per-kind stage order: Back and the Dots
  // both derive from it, so the EVM path can never step into the Tezos-only
  // 'reveal' stage or hand the stepper an out-of-range index.
  const stages: readonly Stage[] = isEvm
    ? ['intro', 'confirm', 'password']
    : ['intro', 'reveal', 'confirm', 'password'];

  const [stage, setStage] = useState<Stage>('intro');
  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [cv, setCv] = useState<[string, string, string]>(['', '', '']);
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Freshly generated on first render; only persisted (encrypted) on submit.
  const [mnemonic, setMnemonic] = useState(() => newMnemonic());
  const [privkey, setPrivkey] = useState(() => randomEvmPrivateKey());
  const words = useMemo(() => mnemonic.split(' '), [mnemonic]);
  const positions = useMemo(() => pickConfirmPositions(words.length), [words.length]);
  const allCorrect = positions.every(
    (p, i) => cv[i].trim().toLowerCase() === words[p - 1],
  );

  const back = (): void => {
    const i = stages.indexOf(stage);
    if (i <= 0) ctx.nav.back();
    else setStage(stages[i - 1]);
  };

  const submit = (): void => {
    if (busy) return;
    setErr(null);
    if (pwd.length < 8) { setErr('Password must be at least 8 characters'); return; }
    if (pwd !== confirm) { setErr('Passwords do not match'); return; }
    setBusy(true);
    void (async () => {
      try {
        if (isEvm) await ctx.importWallet({ source: 'evm-privkey', privateKey: privkey, password: pwd });
        else await ctx.createTezosWallet(mnemonic, pwd);
        // Flow complete (the Gate re-scopes to the unlocked shell) — drop every
        // secret-bearing reference now rather than at fiber GC.
        setPwd(''); setConfirm(''); setCv(['', '', '']);
        setMnemonic(''); setPrivkey('');
      } catch (e) {
        setErr(formatError(e).detail);
      } finally {
        setBusy(false);
      }
    })();
  };

  const title: Record<Stage, string> = {
    intro: isEvm ? 'Create EVM account' : 'Create wallet',
    reveal: 'Recovery phrase', // Tezos-only stage: unreachable on the EVM path
    confirm: isEvm ? 'Private key' : 'Confirm phrase',
    password: 'Set password',
  };

  const setWord = (i: number, v: string): void =>
    setCv((n) => n.map((x, k) => (k === i ? v : x)) as [string, string, string]);

  return (
    <View style={styles.screen}>
      <TopBar
        title={title[stage]}
        onBack={back}
        right={
          <View style={styles.dots}>
            <Dots i={stages.indexOf(stage)} n={stages.length} />
          </View>
        }
      />

      {stage === 'intro' && (
        <>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.stageTitle}>
              {isEvm
                ? 'Before we generate your private key'
                : 'Before we generate your recovery phrase'}
            </Text>
            <Text style={styles.lead}>
              {isEvm
                ? 'This key unlocks your EVM runtime account. There’s no recovery beyond it.'
                : 'These words unlock your Michelson runtime account. There’s no recovery beyond them.'}
            </Text>
            <View style={styles.checks}>
              <Check checked={ack1} onToggle={setAck1}>
                I’ll store it offline. Tezos X can’t restore it for me.
              </Check>
              <Check checked={ack2} onToggle={setAck2}>
                Anyone with it can move my funds.
              </Check>
            </View>
          </ScrollView>
          <View style={styles.actionBar}>
            <Btn
              variant="accent"
              full
              disabled={!ack1 || !ack2}
              onPress={() => setStage(isEvm ? 'confirm' : 'reveal')}
            >
              {isEvm ? 'Generate key' : 'Generate phrase'}
            </Btn>
          </View>
        </>
      )}

      {stage === 'reveal' && (
        <>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.lead}>
              Write these {words.length} words down in order. Keep them offline.
            </Text>
            <View style={styles.noteBox}>
              <Icon name="info" size={14} color={colors.fgSubtle} />
              <Text style={styles.noteText}>
                This phrase restores every account you create in this wallet. A Tezos
                secret key or EVM private key you import isn't derived from it — back
                those up separately.
              </Text>
            </View>
            <View>
              <View style={styles.seedGrid}>
                {words.map((w, i) => (
                  <View style={styles.seedWord} key={i}>
                    <Text style={styles.seedNum}>{i + 1}</Text>
                    <Text style={styles.seedText}>{revealed ? w : '••••••'}</Text>
                  </View>
                ))}
              </View>
              {!revealed && (
                <Pressable style={styles.seedOverlay} onPress={() => setRevealed(true)}>
                  <View style={styles.revealInner}>
                    <Icon name="eye" size={30} color={colors.fg} />
                    <Text style={styles.revealTitle}>Tap to reveal</Text>
                    <Text style={styles.revealSub}>Make sure nobody’s looking at your screen.</Text>
                  </View>
                </Pressable>
              )}
            </View>
          </ScrollView>
          <View style={styles.actionBar}>
            <Btn variant="accent" full disabled={!revealed} onPress={() => setStage('confirm')}>
              I’ve written it down
            </Btn>
          </View>
        </>
      )}

      {stage === 'confirm' && (
        <>
          <ScrollView contentContainerStyle={styles.scroll}>
            {isEvm ? (
              <>
                <Text style={styles.lead}>Your fresh EVM private key. Store it somewhere safe.</Text>
                <View style={styles.keyCard}>
                  <Text style={styles.keyText}>{privkey}</Text>
                </View>
                <Text style={styles.hint}>
                  The address is derived from this key. It never leaves this device.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.lead}>Type the words that go in these positions.</Text>
                <View style={styles.fields}>
                  {positions.map((p, i) => (
                    <View key={p}>
                      <Text style={styles.fieldLabel}>Word #{p}</Text>
                      <TextInput
                        style={styles.inputMono}
                        value={cv[i]}
                        placeholder="…"
                        placeholderTextColor={colors.fgSubtle}
                        autoCapitalize="none"
                        autoCorrect={false}
                        onChangeText={(v) => setWord(i, v)}
                      />
                    </View>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
          <View style={styles.actionBar}>
            <Btn
              variant="accent"
              full
              disabled={!isEvm && !allCorrect}
              onPress={() => setStage('password')}
            >
              Continue
            </Btn>
          </View>
        </>
      )}

      {stage === 'password' && (
        <PasswordStage
          pwd={pwd}
          setPwd={setPwd}
          confirm={confirm}
          setConfirm={setConfirm}
          err={err}
          busy={busy}
          submitLabel="Open wallet"
          onSubmit={submit}
        />
      )}
    </View>
  );
}

/** Password + confirm stage, shared by Create's final step. */
function PasswordStage({
  pwd,
  setPwd,
  confirm,
  setConfirm,
  err,
  busy,
  submitLabel,
  onSubmit,
}: {
  pwd: string;
  setPwd: (v: string) => void;
  confirm: string;
  setConfirm: (v: string) => void;
  err: string | null;
  busy: boolean;
  submitLabel: string;
  onSubmit: () => void;
}): React.JSX.Element {
  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.lead}>
          This password encrypts your vault on this device. You’ll enter it to unlock.
        </Text>
        <View style={styles.fields}>
          <View>
            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={pwd}
              placeholder="At least 8 characters"
              placeholderTextColor={colors.fgSubtle}
              autoCapitalize="none"
              onChangeText={setPwd}
            />
          </View>
          <View>
            <Text style={styles.fieldLabel}>Confirm password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={confirm}
              placeholder="Re-enter password"
              placeholderTextColor={colors.fgSubtle}
              autoCapitalize="none"
              onChangeText={setConfirm}
            />
          </View>
          {err != null && <ErrorInline title={err} />}
        </View>
      </ScrollView>
      <View style={styles.actionBar}>
        <Btn variant="accent" full loading={busy} disabled={!pwd || !confirm} onPress={onSubmit}>
          {submitLabel}
        </Btn>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  dots: { paddingRight: space[2] },
  scroll: { padding: 22 },
  stageTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '600',
    letterSpacing: -0.36,
    lineHeight: 29,
    color: colors.fg,
    marginBottom: 10,
  },
  lead: { fontSize: fontSize.md, color: colors.fgMuted, marginBottom: space[4], lineHeight: 22 },
  checks: { gap: space[4] },
  noteBox: {
    flexDirection: 'row',
    gap: space[2],
    alignItems: 'flex-start',
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: space[4],
  },
  noteText: { flex: 1, fontSize: fontSize.sm, color: colors.fgMuted, lineHeight: 19 },

  seedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  seedWord: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space[2],
  },
  seedNum: { color: colors.fgSubtle, fontSize: 11, minWidth: 16, fontFamily: font.mono },
  seedText: { color: colors.fg, fontSize: fontSize.sm, fontFamily: font.mono },
  seedOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,11,18,0.72)',
    borderRadius: radius.md,
  },
  revealInner: { alignItems: 'center', gap: 10, paddingHorizontal: space[6] },
  revealTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.fg },
  revealSub: { fontSize: fontSize.sm, color: colors.fgMuted, maxWidth: 220, textAlign: 'center' },

  keyCard: {
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    padding: 16,
  },
  keyText: { fontFamily: font.mono, fontSize: fontSize.sm, lineHeight: 22, color: colors.fg },
  hint: { fontSize: fontSize.xs, color: colors.fgSubtle, marginTop: space[2] },

  fields: { gap: space[4] - 2 },
  fieldLabel: { fontSize: fontSize.sm, color: colors.fgMuted, marginBottom: space[2] },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.md,
    color: colors.fg,
    fontSize: fontSize.md,
    height: 52,
    paddingHorizontal: 16,
  },
  inputMono: {
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.md,
    color: colors.fg,
    fontFamily: font.mono,
    fontSize: fontSize.sm,
    height: 52,
    paddingHorizontal: 16,
  },

  actionBar: {
    padding: space[4],
    paddingBottom: space[4] + 30,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    gap: space[3] - 2,
  },
});
