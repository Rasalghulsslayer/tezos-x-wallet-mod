/**
 * Approve — the dApp-request bottom sheet (mirrors the design's ApproveSheet).
 * A single Modal that abstracts a WalletConnect-style request into three
 * variants driven by the pending kind from the shared context:
 *   - connect:     origin + the pinned account, low-risk band, capability list.
 *   - signature:   the decoded message body, moderate-risk band.
 *   - transaction: the dApp's EVM intent AND, for a cross-runtime call, "what you
 *                  actually sign" — the Michelson target / entrypoint / selector /
 *                  mutez the tz1 signs, forwarded to the EVM runtime via NAC.
 * Approving is gated behind a per-signature biometric confirm, then resolves the
 * pending ApprovalQueue request (unblocking the dApp's awaiting promise over
 * WalletConnect); rejecting — or the scrim / hardware back — resolves it as a
 * rejection. The core writes the per-origin session on a connect approval.
 */

import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { colors, fontSize, font, radius, safe } from '../theme';
import { shortAddr } from '@tezosx/wallet-core/shared/format';
import { originDisplay } from '@tezosx/wallet-core/shared/approval-display';
import { Icon } from '../ui/icon';
import { Btn } from '../ui/tx/Btn';
import { Identicon } from '../ui/tx/Identicon';
import { Line } from '../ui/tx/Line';
import { PinnedChip } from '../ui/tx/PinnedChip';
import { RiskBand } from '../ui/tx/RiskBand';
import { Spinner } from '../ui/tx/Spinner';
import type { PendingRequest } from '@tezosx/wallet-core/shared/messages';
import { useWallet } from '../wallet/context';


type Stage = 'request' | 'signing';

export function Approve(): React.JSX.Element | null {
  const ctx = useWallet();
  const req = ctx.approve;
  const [stage, setStage] = useState<Stage>('request');

  useEffect(() => {
    setStage('request');
  }, [req?.requestId]);

  if (req == null) return null;

  const origin = originDisplay(req.origin);
  const pinned = ctx.accounts.find((a) => a.id === req.accountId) ?? ctx.activeAccount;
  // The dApp-visible face of the pinned account; null while a tz1's EVM alias
  // is still resolving, in which case the chip shows a placeholder.
  const pinnedAddr = pinned.kind === 'evm' ? pinned.address ?? null : pinned.evmAlias ?? null;
  const accent: 'purple' | 'cyan' = req.kind === 'transaction' ? 'purple' : 'cyan';

  // reject resolves the dApp's pending promise immediately; approve gates on the
  // biometric confirm inside resolveApproval — on cancel it returns false and the
  // sheet stays open (the request is not resolved).
  const respond = (decision: 'approve' | 'reject'): void => {
    if (decision === 'reject') {
      void ctx.resolveApproval('reject');
      return;
    }
    setStage('signing');
    void (async () => {
      const ok = await ctx.resolveApproval('approve');
      if (!ok) setStage('request');
    })();
  };

  const busy = stage === 'signing';

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
              <Spinner accent={accent} />
              <Text style={styles.busyTitle}>Waiting for confirmation</Text>
            </View>
          </View>
        </View>
      ) : (
        <Pressable style={styles.overlay} onPress={() => respond('reject')}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.grip} />
            <ApproveHead accent={accent} subtitle={SUBTITLE[req.kind]} origin={origin} />
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <PinnedChip
                label={ctx.labelFor(pinned)}
                addr={pinnedAddr != null ? shortAddr(pinnedAddr, 8) : 'Resolving EVM address…'}
                leading={<Identicon seed={pinned.identitySeed} size={34} />}
              />
              <Body req={req} host={origin.title} />
            </ScrollView>
            {!ctx.online && (
              <View style={styles.offlineNote}>
                <Icon name="info" size={15} color={colors.warning} />
                <Text style={styles.offlineNoteText}>
                  You're offline — approving will fail until the connection returns.
                </Text>
              </View>
            )}
            <View style={styles.actionBar}>
              <Btn variant="outline" onPress={() => respond('reject')}>
                Reject
              </Btn>
              {/* Offline, an approval can only fail (the dApp is reached over the
                  network) — disable it before the biometric prompt ever fires.
                  Reject stays available: it resolves the local queue.
                  A request kind this surface cannot describe gets NO approve
                  button at all — see `canApprove`. */}
              {canApprove(req.kind) && (
                <Btn variant="accent" full disabled={!ctx.online} onPress={() => respond('approve')}>
                  {CONFIRM_LABEL[req.kind]}
                </Btn>
              )}
            </View>
          </Pressable>
        </Pressable>
      )}
    </Modal>
  );
}

const SUBTITLE: Record<PendingRequest['kind'], string> = {
  connect: 'Connection request',
  signature: 'Signature request',
  transaction: 'Transaction request',
  'tezos-operation': 'Unsupported request',
};

const CONFIRM_LABEL: Record<PendingRequest['kind'], string> = {
  connect: 'Connect',
  signature: 'Sign',
  transaction: 'Approve',
  // Never rendered: `canApprove` below hides the approve button for this kind.
  'tezos-operation': 'Approve',
};

/**
 * A native Michelson `operation_request` reaches the approval queue only from the
 * extension's Beacon transport, which this shell does not have — the mobile
 * surface speaks WalletConnect and EIP-1193. So the kind exists in the shared
 * union but cannot arise here.
 *
 * FAIL CLOSED rather than assume that. If one ever did arrive — a future mobile
 * Beacon transport, or a core change that routes one here — the screen must not
 * offer an approve button for an operation it cannot describe. Approving what the
 * screen did not show is the one outcome worth designing against.
 */
function canApprove(kind: PendingRequest['kind']): boolean {
  return kind !== 'tezos-operation';
}

function Body({
  req,
  host,
}: {
  req: PendingRequest;
  host: string;
}): React.JSX.Element {
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
          <Text style={styles.messageText}>{req.decoded ?? req.message}</Text>
        </View>
      </>
    );
  }

  if (req.kind === 'tezos-operation') {
    // Reachable only if a future transport routes a Beacon operation here. Names
    // what it is and refuses, rather than rendering EVM fields for a Michelson
    // operation — which is what the elimination-narrowing below used to do.
    return (
      <>
        <Text style={styles.kicker}>Requesting</Text>
        <Text style={styles.headline}>Tezos operation</Text>
        <RiskBand
          level="med"
          title="Not supported on mobile"
          detail="This is a native Michelson operation, which only the browser extension can sign. Reject it here."
        />
        <View style={styles.card}>
          <Line label="Destination" value={<Text style={styles.mono}>{shortAddr(req.destination, 8)}</Text>} />
          <View style={styles.divider} />
          <Line label="Entrypoint" value={req.entrypoint ?? '—'} />
          <View style={styles.divider} />
          <Line label="Amount" value={`${req.amount} mutez`} />
        </View>
      </>
    );
  }

  const cross = req.crossRuntime;
  return (
    <>
      <Text style={styles.kicker}>Requesting</Text>
      <Text style={styles.headline}>{req.methodSig ?? 'Transaction'}</Text>
      <RiskBand level="med" title="Moderate" detail="Review the recipient and amount before signing." />
      <Text style={[styles.kicker, styles.kickerSpaced]}>dApp intent</Text>
      <View style={styles.card}>
        <Line label="To" value={<Text style={styles.mono}>{shortAddr(req.to, 8)}</Text>} />
        <View style={styles.divider} />
        <Line label="Value" value={req.value} />
        <View style={styles.divider} />
        <Line label="Data" value={<Text style={styles.mono}>{req.data === '0x' || req.data === '' ? '—' : shortAddr(req.data, 10)}</Text>} />
      </View>
      {cross != null && (
        <>
          <Text style={[styles.kicker, styles.kickerSpaced]}>What you actually sign</Text>
          <View style={[styles.card, styles.crossCard]}>
            <Line label="Michelson target" value={<Text style={styles.mono}>{shortAddr(cross.michelsonTarget, 6)}</Text>} />
            <View style={styles.divider} />
            <Line label="Entrypoint" value={cross.entrypoint} />
            <View style={styles.divider} />
            <Line label="Selector" value={<Text style={styles.mono}>{cross.decodedSelector ?? '—'}</Text>} />
            <View style={styles.divider} />
            <Line label="Debit (mutez)" value={cross.mutezValue} />
          </View>
          <Text style={styles.crossNote}>
            Your tz1 signs a Michelson-runtime operation that the kernel forwards to the EVM runtime — cross-runtime via NAC gateway.
          </Text>
        </>
      )}
    </>
  );
}

function ApproveHead({
  accent,
  subtitle,
  origin,
}: {
  accent: 'purple' | 'cyan';
  subtitle: string;
  origin: { title: string; secure: boolean; favLetter: string };
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
        <Text style={styles.headFavText}>{origin.favLetter}</Text>
      </View>
      <View style={styles.headText}>
        {/* An insecure origin is flagged here and spelled out with its scheme
            below, so a look-alike http origin can't pass for the real site. */}
        <View style={styles.headSubRow}>
          <Icon
            name={origin.secure ? 'lock' : 'alert'}
            size={11}
            color={origin.secure ? colors.success : colors.danger}
          />
          <Text style={styles.headSub}>
            {origin.secure ? subtitle : `Insecure origin · ${subtitle}`}
          </Text>
        </View>
        <Text style={styles.headHost}>{origin.title}</Text>
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
  headText: { flex: 1, minWidth: 0 },
  headSubRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
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

  // Same amber band pattern as the Activity/Home stale bands.
  offlineNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,184,76,0.07)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,184,76,0.18)',
  },
  offlineNoteText: { flex: 1, fontSize: fontSize.xs, color: colors.fgMuted },
});
