/**
 * Approve — the dApp-request bottom sheet (mirrors the design's ApproveSheet).
 * A single Modal that abstracts a WalletConnect-style request into three
 * variants driven by the pending kind from the shared context:
 *   - connect:     origin + the pinned account, low-risk band, capability list.
 *   - signature:   the decoded message body, moderate-risk band.
 *   - transaction: the dApp's EVM intent AND, for a cross-runtime call, "what you
 *                  actually sign" — the Michelson target / entrypoint / selector /
 *                  mutez the tz1 signs, forwarded to the EVM runtime via NAC.
 * Approving runs a brief signing → done animation before resolving; rejecting (or
 * tapping the scrim) closes immediately. Connect additionally records the session.
 */

import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { colors, fontSize, font, radius, safe } from '../theme';
import { truncAddr } from '../ui/format';
import { Icon } from '../ui/icon';
import { Btn } from '../ui/tx/Btn';
import { Burst } from '../ui/tx/Burst';
import { Identicon } from '../ui/tx/Identicon';
import { Line } from '../ui/tx/Line';
import { PinnedChip } from '../ui/tx/PinnedChip';
import { RiskBand } from '../ui/tx/RiskBand';
import { Spinner } from '../ui/tx/Spinner';
import { useWallet } from '../wallet/context';
import { MOCK_PENDING, type PendingKind } from '../mocks';
import type { ViewAccount } from '../wallet/view-account';

function hostOf(origin: string): string {
  const m = /^[a-z]+:\/\/([^/]+)/i.exec(origin);
  return m != null ? m[1] : origin;
}

type Stage = 'request' | 'signing' | 'done';

export function Approve(): React.JSX.Element | null {
  const ctx = useWallet();
  const pending = ctx.approve;
  const [stage, setStage] = useState<Stage>('request');

  useEffect(() => {
    setStage('request');
  }, [pending?.kind]);

  if (pending == null) return null;

  const req = MOCK_PENDING[pending.kind];
  const host = hostOf(req.origin);
  const pinned = ctx.accounts.find((a) => a.id === req.accountId) ?? ctx.activeAccount;

  const respond = (decision: 'approve' | 'reject'): void => {
    if (decision === 'reject') {
      ctx.closeApprove();
      return;
    }
    setStage('signing');
    setTimeout(() => {
      setStage('done');
      if (pending.kind === 'connect') ctx.addSession(req.origin, req.accountId);
      setTimeout(() => ctx.closeApprove(pending.kind === 'connect' ? 'connections' : null), 1000);
    }, 1300);
  };

  const busy = stage === 'signing' || stage === 'done';

  return (
    <Modal
      transparent
      visible
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => respond('reject')}
    >
      {busy ? (
        <View style={styles.overlay}>
          <View style={[styles.sheet, styles.busySheet]}>
            <View style={styles.grip} />
            <View style={styles.busyBody}>
              {stage === 'signing' ? (
                <>
                  <Spinner accent={pending.kind === 'transaction' ? 'purple' : 'cyan'} />
                  <Text style={styles.busyTitle}>Waiting for confirmation</Text>
                </>
              ) : (
                <>
                  <Burst />
                  <Text style={styles.doneTitle}>Done</Text>
                  <Text style={styles.doneSub}>You can return to {host}.</Text>
                </>
              )}
            </View>
          </View>
        </View>
      ) : (
        <Pressable style={styles.overlay} onPress={() => respond('reject')}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.grip} />
            <ApproveHead
              accent={pending.kind === 'transaction' ? 'purple' : 'cyan'}
              subtitle={SUBTITLE[pending.kind]}
              host={host}
            />
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <PinnedChip
                label={ctx.labelFor(pinned)}
                addr={truncAddr(pinned.kind === 'evm' ? pinned.address : pinned.evmAlias, 8)}
                leading={<Identicon seed={pinned.identitySeed} size={34} />}
              />
              <Body pending={pending.kind} pinned={pinned} host={host} />
            </ScrollView>
            <View style={styles.actionBar}>
              <Btn variant="outline" onPress={() => respond('reject')}>
                Reject
              </Btn>
              <Btn variant="accent" full onPress={() => respond('approve')}>
                {CONFIRM_LABEL[pending.kind]}
              </Btn>
            </View>
          </Pressable>
        </Pressable>
      )}
    </Modal>
  );
}

const SUBTITLE: Record<PendingKind, string> = {
  connect: 'Connection request',
  signature: 'Signature request',
  transaction: 'Transaction request',
};

const CONFIRM_LABEL: Record<PendingKind, string> = {
  connect: 'Connect',
  signature: 'Sign',
  transaction: 'Approve',
};

function Body({
  pending,
  host,
}: {
  pending: PendingKind;
  pinned: ViewAccount;
  host: string;
}): React.JSX.Element {
  const req = MOCK_PENDING[pending];

  if (req.kind === 'connect') {
    return (
      <>
        <Text style={styles.kicker}>Requesting</Text>
        <Text style={styles.headline}>Connect to {host}</Text>
        <RiskBand
          level="low"
          title="Low risk"
          detail="The site will see your EVM-visible address. You’ll approve each transaction individually."
        />
        <View style={styles.card}>
          <Line label="Origin" value={host} />
          <View style={styles.divider} />
          <Line label="Will receive" value="Your 0x address" />
          <View style={styles.divider} />
          <Line label="Can request" value="Transactions (each approved)" />
        </View>
      </>
    );
  }

  if (req.kind === 'signature') {
    return (
      <>
        <Text style={styles.kicker}>Requesting</Text>
        <Text style={styles.headline}>Sign message</Text>
        <RiskBand level="med" title="Moderate" detail="The site only gets a signature — no transaction is broadcast." />
        <Text style={[styles.kicker, styles.kickerSpaced]}>Message</Text>
        <View style={styles.messageCard}>
          <Text style={styles.messageText}>{req.decoded}</Text>
        </View>
      </>
    );
  }

  const cross = req.crossRuntime;
  return (
    <>
      <Text style={styles.kicker}>Requesting</Text>
      <Text style={styles.headline}>{req.methodSig}</Text>
      <RiskBand level="med" title="Moderate" detail="Review the recipient and amount before signing." />
      <Text style={[styles.kicker, styles.kickerSpaced]}>dApp intent</Text>
      <View style={styles.card}>
        <Line label="To" value={<Text style={styles.mono}>{truncAddr(req.to, 8)}</Text>} />
        <View style={styles.divider} />
        <Line label="Value" value={req.value} />
        <View style={styles.divider} />
        <Line label="Data" value={<Text style={styles.mono}>{truncAddr(req.data, 10)}</Text>} />
      </View>
      {cross != null && (
        <>
          <Text style={[styles.kicker, styles.kickerSpaced]}>What you actually sign</Text>
          <View style={[styles.card, styles.crossCard]}>
            <Line label="Michelson target" value={<Text style={styles.mono}>{truncAddr(cross.michelsonTarget, 6)}</Text>} />
            <View style={styles.divider} />
            <Line label="Entrypoint" value={cross.entrypoint} />
            <View style={styles.divider} />
            <Line label="Selector" value={<Text style={styles.mono}>{cross.decodedSelector}</Text>} />
            <View style={styles.divider} />
            <Line label="Debit (mutez)" value={cross.mutezValue} />
          </View>
          <Text style={styles.crossNote}>
            Your tz1 signs an L1 operation that the kernel forwards to the EVM runtime — cross-runtime via NAC gateway.
          </Text>
        </>
      )}
    </>
  );
}

function ApproveHead({
  accent,
  subtitle,
  host,
}: {
  accent: 'purple' | 'cyan';
  subtitle: string;
  host: string;
}): React.JSX.Element {
  const tint = accent === 'purple' ? colors.purple : colors.cyan;
  return (
    <View style={styles.head}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="ah-tint" cx="0" cy="0" r="1.2">
            <Stop offset="0" stopColor={tint} stopOpacity={0.14} />
            <Stop offset="0.6" stopColor={tint} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#ah-tint)" />
      </Svg>
      <View style={styles.headFav}>
        <Text style={styles.headFavText}>{host.charAt(0).toUpperCase()}</Text>
      </View>
      <View>
        <Text style={styles.headSub}>{subtitle}</Text>
        <Text style={styles.headHost}>{host}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '88%',
    paddingBottom: safe.bottom,
    overflow: 'hidden',
  },
  busySheet: { minHeight: 320 },
  grip: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  busyBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 24, paddingVertical: 40 },
  busyTitle: { fontSize: fontSize.lg, color: colors.fg },
  doneTitle: { fontSize: fontSize['2xl'], fontWeight: '600', color: colors.fg },
  doneSub: { fontSize: fontSize.sm, color: colors.fgMuted, textAlign: 'center' },

  head: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border, overflow: 'hidden' },
  headFav: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headFavText: { color: colors.fg, fontWeight: '700', fontSize: 17 },
  headSub: { fontSize: fontSize.xs, textTransform: 'uppercase', letterSpacing: 0.85, color: colors.fgSubtle, fontWeight: '600' },
  headHost: { fontSize: fontSize.lg, fontWeight: '600', color: colors.fg, marginTop: 2 },

  scroll: { flexGrow: 0 },
  scrollContent: { padding: 16 },
  kicker: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.fgSubtle, fontWeight: '600', marginBottom: 6 },
  kickerSpaced: { marginTop: 14 },
  headline: { fontSize: fontSize.xl, fontWeight: '600', letterSpacing: -0.3, color: colors.fg, marginBottom: 14 },

  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: 'hidden', marginTop: 14 },
  crossCard: { borderColor: 'rgba(124,92,255,0.18)' },
  divider: { height: 1, backgroundColor: colors.border },
  mono: { fontFamily: font.mono, fontSize: fontSize.md, fontWeight: '500', color: colors.fg },
  crossNote: { fontSize: fontSize.xs, color: colors.fgSubtle, lineHeight: 20, marginTop: 10, paddingHorizontal: 2 },

  messageCard: { backgroundColor: colors.surface2, borderRadius: radius.lg, padding: 16, maxHeight: 200 },
  messageText: { fontFamily: font.mono, fontSize: fontSize.sm, color: colors.fg, lineHeight: 21 },

  actionBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    gap: 10,
  },
});
