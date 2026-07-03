/**
 * Send — the transfer flow, a three-stage local state machine:
 *   form   → pick asset (Sheet), enter recipient (RoutingCard reflects the route),
 *            enter amount (Max / available), validate.
 *   review → From→To lane with runtime pills, amount / routing / network lines,
 *            an insufficient-balance warning, and a routing explainer.
 *   done   → animated StatusTimeline (broadcasting → included → finalized driven
 *            by setTimeout), the sent amount + recipient, and the resulting hash.
 * Cross-runtime is inferred from source kind × destination runtime; the routing
 * copy comes verbatim from the design's routingLabel.
 */

import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, font, fontSize, radius, space } from '../theme';
import { detectRuntime, fmtXtz, truncAddr } from '../ui/format';
import { Icon } from '../ui/icon';
import { AssetMark } from '../ui/tx/AssetMark';
import { Btn } from '../ui/tx/Btn';
import { Burst } from '../ui/tx/Burst';
import { ChainPill } from '../ui/tx/ChainPill';
import { ErrorInline } from '../ui/tx/ErrorInline';
import { Line } from '../ui/tx/Line';
import { RoutingCard, routingLabel } from '../ui/tx/RoutingCard';
import { Sheet } from '../ui/tx/Sheet';
import { Spinner } from '../ui/tx/Spinner';
import { StatusTimeline, type TimelineStage } from '../ui/tx/StatusTimeline';
import { TopBar } from '../ui/tx/TopBar';
import { useWallet } from '../wallet/context';

type SendAsset = { kind: 'xtz' | 'token'; symbol: string; address?: string };
type Stage = 'form' | 'review' | 'done';
interface DoneInfo {
  amount: string;
  symbol: string;
  to: string;
  runtime: 'l1' | 'l2';
  sign: string;
  hash: string;
}

const AMOUNT_RE = /^\d+(\.\d+)?$/;

export function Send(_props: { params?: Record<string, unknown> } = {}): React.JSX.Element {
  const ctx = useWallet();
  const acc = ctx.activeAccount;
  const isEvm = acc.kind === 'evm';
  const bal = ctx.balances.data;
  const tokens = ctx.tokens.data ?? [];

  const assets = useMemo<SendAsset[]>(
    () => [
      { kind: 'xtz', symbol: 'XTZ' },
      ...tokens.map((t): SendAsset => ({ kind: 'token', symbol: t.symbol, address: t.address })),
    ],
    [tokens],
  );

  const [stage, setStage] = useState<Stage>('form');
  const [asset, setAsset] = useState<SendAsset>(assets[0]);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [assetOpen, setAssetOpen] = useState(false);
  const [done, setDone] = useState<DoneInfo | null>(null);
  const [tlStage, setTlStage] = useState<TimelineStage>('broadcasting');

  const dest = detectRuntime(to);
  const available =
    asset.kind === 'xtz' ? bal?.xtz ?? '0' : bal?.tokens[(asset.address ?? '').toLowerCase()] ?? '0';
  const insufficient = parseFloat(amount || '0') > parseFloat(available);
  const valid =
    dest != null &&
    AMOUNT_RE.test(amount) &&
    Number(amount) > 0 &&
    !(asset.kind === 'token' && dest === 'l1');
  const isCross = acc.kind === 'tezos' ? dest === 'l2' : dest === 'l1';
  const predictedRuntime: 'l1' | 'l2' =
    acc.kind === 'tezos' && asset.kind === 'xtz' && dest === 'l1' ? 'l1' : 'l2';
  const fromAddr = isEvm ? acc.address : acc.tz1;

  const back = (): void => {
    if (stage === 'form') ctx.nav.back();
    else if (stage === 'review') setStage('form');
  };

  // Animate the done timeline: broadcasting → included → finalized.
  useEffect(() => {
    if (stage !== 'done') return;
    setTlStage('broadcasting');
    const t1 = setTimeout(() => setTlStage('included'), 1600);
    const t2 = setTimeout(() => setTlStage('finalized'), 3400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [stage]);

  if (stage === 'done' && done != null) {
    const finalized = tlStage === 'finalized';
    return (
      <View style={styles.screen}>
        <TopBar />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.doneScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.statusHero}>
            {finalized ? <Burst /> : <Spinner accent={done.runtime === 'l2' ? 'cyan' : 'purple'} />}
            <View style={styles.heroText}>
              <Text style={styles.sAmt}>
                {done.sign}
                {fmtXtz(done.amount, 2, 6)} {done.symbol}
              </Text>
              <Text style={styles.sTo}>
                to <Text style={styles.mono}>{truncAddr(done.to, 6)}</Text>
              </Text>
            </View>
          </View>
          <StatusTimeline stage={tlStage} runtime={done.runtime} />
          <View style={styles.doneCard}>
            <Line
              label={done.runtime === 'l1' ? 'Operation hash' : 'Transaction hash'}
              value={<Text style={styles.mono}>{truncAddr(done.hash, 6)}</Text>}
            />
            <View style={styles.divider} />
            <Line label="Explorer" value={done.runtime === 'l1' ? 'tzkt' : 'blockscout'} />
          </View>
        </ScrollView>
        <View style={styles.actionBar}>
          <Btn variant={finalized ? 'accent' : 'outline'} full onPress={() => ctx.nav.reset('home')}>
            Done
          </Btn>
        </View>
      </View>
    );
  }

  if (stage === 'review') {
    const fromChain: 'l1' | 'l2' = isEvm ? 'l2' : 'l1';
    const destChain: 'l1' | 'l2' = dest === 'l2' ? 'l2' : 'l1';
    const reviewCopy = isCross
      ? isEvm
        ? 'Your 0x signs an EVM transaction that calls the NAC precompile. The kernel forwards the value to the receiving tz1 atomically.'
        : 'Your tz1 signs an L1 op routed to the EVM runtime through the NAC gateway. The receiving 0x address is credited atomically.'
      : 'Make sure the recipient is correct — transfers can’t be reversed.';
    const r = routingLabel(acc.kind, dest);

    return (
      <View style={styles.screen}>
        <TopBar title="Review transfer" onBack={back} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.reviewScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.lane}>
            <View style={styles.laneSide}>
              <Text style={styles.laneK}>From</Text>
              <Text style={styles.laneV} numberOfLines={1}>
                {truncAddr(fromAddr, 6)}
              </Text>
              <ChainPill chain={fromChain} />
            </View>
            <View style={[styles.laneArrow, isCross && styles.laneArrowCross]}>
              <Icon name="arrow-right" size={15} color={isCross ? '#FFFFFF' : colors.fgSubtle} />
            </View>
            <View style={styles.laneSide}>
              <Text style={styles.laneK}>To</Text>
              <Text style={styles.laneV} numberOfLines={1}>
                {truncAddr(to, 6)}
              </Text>
              <ChainPill chain={destChain} />
            </View>
          </View>

          <View style={styles.card}>
            <Line label="Amount" value={`${fmtXtz(amount, 2, 6)} ${asset.symbol}`} />
            <View style={styles.divider} />
            <Line label="Routing" value={r.cross ? `${r.title} · ${r.sub}` : r.title} />
            <View style={styles.divider} />
            <Line label="Network" value="Tezos X Previewnet" />
          </View>

          {insufficient && (
            <View style={styles.warnBanner}>
              <View style={styles.warnIco}>
                <Icon name="alert" size={18} color={colors.danger} />
              </View>
              <View style={styles.warnBody}>
                <Text style={styles.warnTitle}>Insufficient balance</Text>
                <Text style={styles.warnDetail}>
                  You’re sending more {asset.symbol} than this account holds ({fmtXtz(available)}{' '}
                  available).
                </Text>
              </View>
            </View>
          )}

          <View style={styles.explainer}>
            <Icon name="info" size={15} color={colors.fgSubtle} />
            <Text style={styles.explainerText}>{reviewCopy}</Text>
          </View>
        </ScrollView>

        <View style={styles.actionBar}>
          <Btn variant="outline" onPress={back}>
            Cancel
          </Btn>
          <Btn
            variant="accent"
            full
            disabled={insufficient}
            onPress={() => {
              setDone({
                amount,
                symbol: asset.symbol,
                to,
                runtime: predictedRuntime,
                sign: '−',
                hash:
                  predictedRuntime === 'l1'
                    ? 'op' + Math.random().toString(36).slice(2, 12)
                    : '0x' + Math.random().toString(16).slice(2, 12),
              });
              setStage('done');
            }}
          >
            Confirm &amp; send
          </Btn>
        </View>
      </View>
    );
  }

  // form
  return (
    <View style={styles.screen}>
      <TopBar title="Send" onBack={back} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.kicker, styles.kickerFirst]}>Asset</Text>
        <Pressable
          style={({ pressed }) => [styles.assetPicker, pressed && styles.assetPickerPressed]}
          onPress={() => setAssetOpen(true)}
        >
          <AssetMark symbol={asset.symbol} kind={asset.kind} size="sm" />
          <View style={styles.assetPickerBody}>
            <Text style={styles.assetPickerName}>{asset.symbol}</Text>
            <Text style={styles.assetPickerSub}>
              {asset.kind === 'xtz' ? 'Native asset' : 'ERC-20 · EVM runtime'}
            </Text>
          </View>
          <Icon name="chevron-down" size={18} color={colors.fgMuted} />
        </Pressable>

        <Text style={[styles.kicker, styles.kickerRecipient]}>Recipient</Text>
        <TextInput
          style={styles.input}
          value={to}
          onChangeText={setTo}
          placeholder={isEvm ? '0x… or tz1…' : 'tz1… or 0x…'}
          placeholderTextColor={colors.fgSubtle}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <RoutingCard sourceKind={acc.kind} dest={dest} />

        <Text style={[styles.kicker, styles.kickerAmount]}>Amount</Text>
        <View style={styles.amountCard}>
          <TextInput
            style={styles.amountInput}
            inputMode="decimal"
            value={amount}
            placeholder="0"
            placeholderTextColor={colors.fgSubtle}
            onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
            textAlign="center"
          />
          <View style={styles.avail}>
            <View style={styles.availTxt}>
              <Text style={[styles.availLbl, insufficient && styles.availLow]}>Available</Text>
              <Text style={[styles.availSep, insufficient && styles.availLow]}>·</Text>
              <Text style={[styles.availNum, insufficient && styles.availLow]}>
                {fmtXtz(available)} {asset.symbol}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.maxPill, pressed && styles.maxPillPressed]}
              onPress={() => setAmount(available)}
            >
              <Text style={styles.maxPillText}>Max</Text>
            </Pressable>
          </View>
        </View>

        {asset.kind === 'token' && dest === 'l1' && (
          <ErrorInline
            title="ERC-20 tokens live on the EVM runtime"
            detail="Pick a 0x recipient — L1 destinations aren’t valid for this asset."
          />
        )}
      </ScrollView>

      <View style={styles.actionBar}>
        <Btn variant="accent" full disabled={!valid} onPress={() => setStage('review')}>
          Review
        </Btn>
      </View>

      {assetOpen && (
        <Sheet title="Select asset" onClose={() => setAssetOpen(false)}>
          <View style={styles.sheetBody}>
            {assets.map((a) => (
              <Pressable
                key={a.symbol}
                style={({ pressed }) => [styles.assetRow, pressed && styles.assetRowPressed]}
                onPress={() => {
                  setAsset(a);
                  setAssetOpen(false);
                }}
              >
                <AssetMark symbol={a.symbol} kind={a.kind} />
                <View style={styles.assetRowBody}>
                  <Text style={styles.assetRowName}>{a.symbol}</Text>
                  <Text style={styles.assetRowSub}>
                    {a.kind === 'xtz' ? 'Native asset' : 'ERC-20 · EVM runtime'}
                  </Text>
                </View>
                {a.symbol === asset.symbol && <Icon name="check" size={20} color={colors.purple} />}
              </Pressable>
            ))}
            <Pressable
              style={({ pressed }) => [styles.linkRow, pressed && styles.assetRowPressed]}
              onPress={() => {
                setAssetOpen(false);
                ctx.nav.push('addToken');
              }}
            >
              <View style={styles.linkRowIco}>
                <Icon name="plus" size={18} color={colors.fgMuted} />
              </View>
              <Text style={styles.linkRowTitle}>Add token</Text>
            </Pressable>
          </View>
        </Sheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: colors.bg },
  scroll: { flex: 1, minHeight: 0 },
  mono: { fontFamily: font.mono, letterSpacing: -0.1 },

  formScroll: { paddingTop: 6, paddingHorizontal: 16, paddingBottom: 16 },
  reviewScroll: { padding: 16 },
  doneScroll: { paddingHorizontal: space[5], paddingBottom: 16, alignItems: 'center' },

  kicker: {
    fontSize: 11,
    letterSpacing: 0.99,
    textTransform: 'uppercase',
    color: colors.fgSubtle,
    fontWeight: '600',
  },
  kickerFirst: { paddingTop: 10, paddingBottom: 8 },
  kickerRecipient: { paddingTop: 18, paddingBottom: 8 },
  kickerAmount: { paddingTop: 20, paddingBottom: 8 },

  assetPicker: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  assetPickerPressed: { backgroundColor: colors.surface3 },
  assetPickerBody: { flex: 1 },
  assetPickerName: { fontSize: fontSize.md, fontWeight: '500', color: colors.fg },
  assetPickerSub: { fontSize: fontSize.sm, color: colors.fgMuted, marginTop: 1 },

  input: {
    width: '100%',
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.md,
    color: colors.fg,
    fontSize: fontSize.sm,
    height: 52,
    paddingHorizontal: 16,
    letterSpacing: -0.1,
    fontFamily: font.mono,
  },

  amountCard: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: 18 },
  amountInput: {
    width: '100%',
    color: colors.fg,
    fontSize: fontSize['5xl'],
    fontWeight: '600',
    letterSpacing: -1.56,
    padding: 0,
    fontVariant: ['tabular-nums'],
  },
  avail: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    height: 28,
  },
  availTxt: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  availLbl: { fontSize: fontSize.sm, color: colors.fgSubtle },
  availSep: { fontSize: fontSize.sm, color: colors.fgSubtle },
  availNum: { fontSize: fontSize.sm, color: colors.fgMuted, fontFamily: font.mono, fontVariant: ['tabular-nums'] },
  availLow: { color: colors.danger },
  maxPill: {
    height: 28,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  maxPillPressed: { opacity: 0.85 },
  maxPillText: {
    color: colors.fgMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.66,
    textTransform: 'uppercase',
  },

  // review
  lane: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  laneSide: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: 13,
    gap: 6,
    minWidth: 0,
  },
  laneK: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.63, color: colors.fgSubtle },
  laneV: { fontSize: fontSize.sm, color: colors.fg, letterSpacing: -0.1, fontFamily: font.mono },
  laneArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laneArrowCross: { backgroundColor: colors.purple },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  divider: { height: 1, backgroundColor: colors.border },

  warnBanner: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,93,93,0.18)',
  },
  warnIco: { width: 20, alignItems: 'center' },
  warnBody: { flex: 1 },
  warnTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.danger },
  warnDetail: { fontSize: fontSize.xs, color: colors.fgMuted, lineHeight: 18, marginTop: 3 },

  explainer: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  explainerText: { flex: 1, fontSize: fontSize.xs, color: colors.fgSubtle, lineHeight: 18 },

  // done
  statusHero: { alignItems: 'center', gap: 16, paddingTop: 28, paddingBottom: 12 },
  heroText: { alignItems: 'center' },
  sAmt: {
    fontSize: fontSize['2xl'],
    fontWeight: '600',
    letterSpacing: -0.48,
    color: colors.fg,
    fontVariant: ['tabular-nums'],
  },
  sTo: { fontSize: fontSize.sm, color: colors.fgMuted, marginTop: 4 },
  doneCard: {
    width: '100%',
    marginTop: 12,
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
  },

  actionBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12 + 30,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    gap: 10,
  },

  // asset sheet
  sheetBody: { paddingBottom: 8 },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 4,
    borderRadius: radius.md,
  },
  assetRowPressed: { backgroundColor: colors.surface2 },
  assetRowBody: { flex: 1, minWidth: 0 },
  assetRowName: { fontSize: fontSize.md, fontWeight: '500', color: colors.fg },
  assetRowSub: { fontSize: fontSize.sm, color: colors.fgMuted, marginTop: 1 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 4,
    borderRadius: radius.md,
  },
  linkRowIco: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkRowTitle: { fontSize: fontSize.md, fontWeight: '500', color: colors.fg },
});
