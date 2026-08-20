/**
 * AddToken — the stepped add-ERC-20 flow (mirrors the design's AddTokenScreen).
 * Paste stage validates a 0x contract address (live byte counter + valid/invalid
 * border), offers a paste shortcut, and — for anything but the known-good preset —
 * surfaces a "doesn't look like an ERC-20" card with a "Try anyway" escape hatch.
 * Confirm stage previews the resolved (or assumed) symbol / name / decimals, with
 * a warning banner when metadata was assumed. Submitting registers the token and
 * returns Home.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { RegisteredToken } from '@tezosx/wallet-core/domain/token';
import { formatError, type FormattedError } from '@tezosx/wallet-core/domain/error';
import { colors, fontSize, font, radius } from '../theme';
import { shortAddr } from '@tezosx/wallet-core/shared/format';
import { EVM_ADDR_RE } from '@tezosx/wallet-core/domain/validation';
import { Icon } from '../ui/icon';
import { Btn } from '../ui/tx/Btn';
import { Dots } from '../ui/tx/Dots';
import { ErrorCard } from '../ui/tx/ErrorCard';
import { TopBar } from '../ui/tx/TopBar';
import { useWallet } from '../wallet/context';

type Stage = 'paste' | 'confirm';

/** The core throws NotErc20Error (name-tagged) when decimals() doesn't respond. */
const isNotErc20 = (e: unknown): boolean => e instanceof Error && e.name === 'NotErc20Error';

export function AddToken(): React.JSX.Element {
  const ctx = useWallet();
  const [stage, setStage] = useState<Stage>('paste');
  const [address, setAddress] = useState('');
  const [tryAnyway, setTryAnyway] = useState(false);
  const [preview, setPreview] = useState<RegisteredToken | null>(null);
  const [nonErc20, setNonErc20] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<FormattedError | null>(null);

  const trimmed = address.trim();
  const valid = EVM_ADDR_RE.test(trimmed);
  const bytes = Math.floor(trimmed.replace(/^0x/i, '').replace(/[^0-9a-fA-F]/g, '').length / 2);
  const idx = stage === 'paste' ? 0 : 1;

  const onAddress = (v: string): void => {
    setAddress(v);
    setNonErc20(false);
    setErr(null);
  };

  const back = (): void => {
    if (stage === 'paste') ctx.nav.back();
    else { setStage('paste'); setErr(null); }
  };

  // Read metadata on-chain (no persist) to preview the token. A strict peek that
  // hits NotErc20Error surfaces the "Try anyway" escape hatch (18-decimals fallback).
  const runPeek = (anyway: boolean): void => {
    if (busy || !valid) return;
    setBusy(true);
    setErr(null);
    void (async () => {
      try {
        const token = await ctx.peekToken(trimmed, anyway);
        setPreview(token);
        setTryAnyway(anyway);
        setNonErc20(false);
        setStage('confirm');
      } catch (e) {
        setNonErc20(isNotErc20(e));
        setErr(formatError(e));
      } finally {
        setBusy(false);
      }
    })();
  };

  const finish = (): void => {
    if (busy || preview == null) return;
    setBusy(true);
    setErr(null);
    void (async () => {
      try {
        const token = await ctx.addToken(trimmed, tryAnyway);
        ctx.toast(`${token.symbol} added`);
        ctx.nav.reset('home');
      } catch (e) {
        setErr(formatError(e));
        setBusy(false);
      }
    })();
  };

  return (
    <View style={styles.screen}>
      <TopBar title="Add token" onBack={back} right={<View style={styles.dots}><Dots i={idx} n={3} /></View>} />

      {stage === 'paste' ? (
        <>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.runtime}>
              <View style={styles.runtimeDot} />
              <Text style={styles.runtimeText}>EVM runtime · Tezos X</Text>
            </View>
            <Text style={styles.prompt}>
              Paste a token <Text style={styles.promptAccent}>contract address</Text>
            </Text>
            <Text style={styles.promptSub}>The wallet reads symbol, name and decimals straight from chain.</Text>

            <View style={[styles.field, address !== '' && (valid ? styles.fieldValid : styles.fieldInvalid)]}>
              <TextInput
                style={styles.fieldInput}
                value={address}
                onChangeText={onAddress}
                placeholder="0x…"
                placeholderTextColor={colors.fgSubtle}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
              />
              {address !== '' && (
                <Icon name={valid ? 'check' : 'alert'} size={18} color={valid ? colors.cyan : colors.danger} />
              )}
            </View>
            <View style={styles.bytes}>
              <Text style={styles.bytesText}>{bytes} / 20 bytes</Text>
              <Text style={[styles.bytesText, valid && styles.bytesOk]}>
                {valid ? 'valid 0x address' : 'expects 40 hex chars'}
              </Text>
            </View>

            {nonErc20 ? (
              <View style={styles.nonStandard}>
                <ErrorCard
                  title="This contract doesn’t look like an ERC-20"
                  detail="It didn’t respond to decimals() — it may be non-standard. You can register it anyway, but balances may display incorrectly."
                />
                <Pressable style={styles.tryAnyway} onPress={() => runPeek(true)}>
                  <Text style={styles.tryAnywayText}>Try anyway</Text>
                </Pressable>
              </View>
            ) : err != null ? (
              <View style={styles.nonStandard}>
                <ErrorCard title={err.title} detail={err.detail} />
              </View>
            ) : null}
          </ScrollView>
          <View style={styles.actionBar}>
            <Btn variant="accent-cyan" full loading={busy} disabled={!valid} onPress={() => runPeek(false)}>
              Continue
            </Btn>
          </View>
        </>
      ) : preview != null ? (
        <>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {tryAnyway && (
              <View style={styles.warn}>
                <Icon name="alert" size={18} color={colors.warning} />
                <View style={styles.warnBody}>
                  <Text style={styles.warnTitle}>Balances may display incorrectly</Text>
                  <Text style={styles.warnDetail}>
                    The wallet defaulted to <Text style={styles.warnStrong}>18 decimals</Text> because the contract
                    didn’t respond cleanly. Verify the actual decimals before sending.
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.tokenHead}>
              <View style={[styles.mark, tryAnyway && styles.markUnknown]}>
                <Text style={[styles.markText, tryAnyway && styles.markTextUnknown]}>
                  {tryAnyway ? '?' : preview.symbol.slice(0, 3)}
                </Text>
              </View>
              <View style={styles.tokenHeadBody}>
                <Text style={styles.tokenSymbol}>{preview.symbol}</Text>
                <Text style={styles.tokenName}>{preview.name}</Text>
              </View>
            </View>

            <View style={styles.standard}>
              <View style={[styles.standardDot, tryAnyway && styles.standardDotWarn]} />
              <Text style={styles.standardText}>{tryAnyway ? 'Non-standard · added manually' : 'ERC-20 · EVM runtime'}</Text>
            </View>

            <View style={styles.meta}>
              <MetaRow k="Contract" trailing={<Icon name="copy" size={14} color={colors.fgSubtle} />}>
                {shortAddr(preview.address, 8)}
              </MetaRow>
              <MetaRow k="Name" sans>
                {preview.name}
              </MetaRow>
              <MetaRow k="Decimals" last trailing={tryAnyway ? <AssumedTag /> : undefined}>
                {String(preview.decimals)}
              </MetaRow>
            </View>

            {err != null && (
              <View style={styles.confirmErr}>
                <ErrorCard title={err.title} detail={err.detail} />
              </View>
            )}
          </ScrollView>
          <View style={styles.actionBar}>
            <Btn variant="outline" onPress={() => ctx.nav.reset('home')}>
              Cancel
            </Btn>
            <Btn variant="accent-cyan" full loading={busy} onPress={finish}>
              Add {preview.symbol}
            </Btn>
          </View>
        </>
      ) : null}
    </View>
  );
}

function MetaRow({
  k,
  children,
  sans,
  last,
  trailing,
}: {
  k: string;
  children: string;
  sans?: boolean;
  last?: boolean;
  trailing?: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={[styles.metaRow, last && styles.metaRowLast]}>
      <Text style={styles.metaK}>{k}</Text>
      <View style={styles.metaV}>
        <Text style={[styles.metaVText, sans ? styles.metaVSans : styles.metaVMono]}>{children}</Text>
        {trailing}
      </View>
    </View>
  );
}

function AssumedTag(): React.JSX.Element {
  return (
    <View style={styles.assumed}>
      <Text style={styles.assumedText}>assumed</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  dots: { paddingRight: 8 },
  scroll: { flex: 1 },
  body: { padding: 22 },

  runtime: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 },
  runtimeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.cyan, shadowColor: colors.cyan, shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  runtimeText: { fontSize: fontSize.sm, color: colors.cyanText },
  prompt: { fontSize: fontSize['2xl'], fontWeight: '600', letterSpacing: -0.36, lineHeight: 29, color: colors.fg },
  promptAccent: { color: colors.cyan },
  promptSub: { fontSize: fontSize.sm, color: colors.fgMuted, marginTop: 8, lineHeight: 20 },

  field: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.md,
    paddingLeft: 16,
    paddingRight: 12,
    height: 56,
  },
  fieldValid: { borderColor: colors.cyanLine },
  fieldInvalid: { borderColor: 'rgba(255,93,93,0.5)' },
  fieldInput: { flex: 1, minWidth: 0, color: colors.fg, fontFamily: font.mono, fontSize: fontSize.sm },
  paste: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surface3, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 10 },
  pasteText: { color: colors.fg, fontSize: fontSize.xs },
  bytes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  bytesText: { fontSize: fontSize.xs, color: colors.fgSubtle, fontVariant: ['tabular-nums'] },
  bytesOk: { color: colors.cyan },

  nonStandard: { marginTop: 14 },
  confirmErr: { marginTop: 18 },
  tryAnyway: { alignSelf: 'flex-start', marginTop: 12, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 12 },
  tryAnywayText: { color: colors.fg, fontSize: fontSize.xs },

  warn: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: colors.warningBg, borderWidth: 1, borderColor: 'rgba(255,184,76,0.3)', marginBottom: 18 },
  warnBody: { flex: 1, minWidth: 0 },
  warnTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.warning },
  warnDetail: { fontSize: fontSize.xs, color: colors.fgMuted, lineHeight: 20, marginTop: 4 },
  warnStrong: { color: colors.fg, fontWeight: '600' },
  verify: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 12 },
  verifyText: { color: colors.fg, fontSize: fontSize.xs },

  tokenHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  mark: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#2775CA', alignItems: 'center', justifyContent: 'center' },
  markUnknown: { backgroundColor: colors.surface3 },
  markText: { fontWeight: '700', fontSize: 17, color: '#FFFFFF' },
  markTextUnknown: { color: colors.fgMuted },
  tokenHeadBody: { flex: 1, minWidth: 0 },
  tokenSymbol: { fontSize: fontSize['2xl'], fontWeight: '700', letterSpacing: -0.24, color: colors.fg },
  tokenName: { fontSize: fontSize.sm, color: colors.fgMuted },

  standard: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 10 },
  standardDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.cyan },
  standardDotWarn: { backgroundColor: colors.warning },
  standardText: { fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.cyanText, fontWeight: '600' },

  meta: { backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  metaRowLast: { borderBottomWidth: 0 },
  metaK: { fontSize: fontSize.sm, color: colors.fgMuted },
  metaV: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaVText: { fontSize: fontSize.sm, color: colors.fg },
  metaVMono: { fontFamily: font.mono },
  metaVSans: { fontFamily: font.sans },
  assumed: { backgroundColor: colors.warningBg, borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 7 },
  assumedText: { fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.warning },

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
