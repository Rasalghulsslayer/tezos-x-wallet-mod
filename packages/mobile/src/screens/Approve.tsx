/**
 * Approve: the in-app modal a dApp request is presented through. It reads the
 * pending request from the shared ApprovalQueue (by requestId) and resolves it
 * with the user's decision — the same approve/reject the extension's approve.html
 * drives, minus the cross-context messaging (mobile is in-process).
 *
 * - 'connect': show the dApp origin + the account, approve/reject immediately.
 * - 'transaction': show the dApp's EVM intent AND what the wallet will actually
 *   sign (the NAC cross-runtime Michelson call + the mutez debited), and gate the
 *   approval behind a biometric confirmation — one per signature.
 *
 * 'signature' (personal_sign) is not offered on a tz1 account, so it can't reach
 * here; a defensive fallback rejects anything unexpected.
 */

import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { shortAddr, mutezToXtz } from '@tezosx/wallet-core/shared/format';
import { approvalQueue, keyring, unlockSecret } from '../composition/wiring';
import { colors } from '../theme';

export function Approve({ requestId }: { requestId: string }): React.JSX.Element | null {
  const pending = approvalQueue.get(requestId);
  const [busy, setBusy] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);

  const decide = useCallback(
    async (decision: 'approve' | 'reject'): Promise<void> => {
      // Signing requires a biometric confirmation before we resolve 'approve'.
      if (decision === 'approve' && pending?.kind === 'transaction') {
        setBusy(true);
        setBioError(null);
        const ok = await unlockSecret.confirmBiometric('Confirm transaction');
        setBusy(false);
        if (!ok) {
          setBioError('Biometric confirmation is required to sign.');
          return;
        }
      }
      approvalQueue.resolve(requestId, decision);
    },
    [pending, requestId],
  );

  if (pending == null) return null;

  if (pending.kind === 'connect') {
    const account = keyring.getUnlocked()?.account;
    const accountLine =
      account == null ? '' : account.kind === 'tezos' ? shortAddr(account.tz1) : shortAddr(account.address);
    return (
      <View style={styles.sheet}>
        <Text style={styles.kicker}>Connection request</Text>
        <Text style={styles.title}>{pending.origin}</Text>
        <Text style={styles.detail}>wants to connect to your wallet on Tezos L2 (EVM).</Text>
        <Row label="Account" value={accountLine} />
        <Actions primaryLabel="Connect" busy={busy} onApprove={() => void decide('approve')} onReject={() => void decide('reject')} />
      </View>
    );
  }

  if (pending.kind === 'transaction') {
    const cr = pending.crossRuntime;
    const isCall = pending.data != null && pending.data !== '0x' && pending.data !== '';
    return (
      <View style={styles.sheet}>
        <Text style={styles.kicker}>Transaction request</Text>
        <Text style={styles.title}>{pending.origin}</Text>
        <Text style={styles.detail}>
          wants to {isCall ? 'call a contract' : 'send a transfer'} on Tezos L2 (EVM).
        </Text>

        <Row label="To" value={shortAddr(pending.to)} />
        {cr != null && <Row label="Amount" value={`${mutezToXtz(cr.mutezValue)} ꜩ`} />}

        {cr != null && (
          <View style={styles.signed}>
            <Text style={styles.signedKicker}>Signed as · cross-runtime L1 → L2 via NAC</Text>
            <Row label="Gateway" value={shortAddr(cr.michelsonTarget)} tight />
            <Row label="Entrypoint" value={cr.entrypoint} tight />
            {cr.decodedSelector != null && <Row label="Selector" value={cr.decodedSelector} tight />}
          </View>
        )}

        {bioError != null && <Text style={styles.error}>{bioError}</Text>}
        <Actions primaryLabel="Sign" busy={busy} onApprove={() => void decide('approve')} onReject={() => void decide('reject')} />
      </View>
    );
  }

  // Not offered (e.g. personal_sign on tz1) — refuse rather than mislead.
  return (
    <View style={styles.sheet}>
      <Text style={styles.title}>Unsupported request</Text>
      <Text style={styles.detail}>This request type isn’t supported yet.</Text>
      <Actions primaryLabel={null} busy={false} onApprove={() => {}} onReject={() => void decide('reject')} />
    </View>
  );
}

function Row({ label, value, tight }: { label: string; value: string; tight?: boolean }): React.JSX.Element {
  return (
    <View style={[styles.row, tight && styles.rowTight]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Actions({
  primaryLabel,
  busy,
  onApprove,
  onReject,
}: {
  primaryLabel: string | null;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.actions}>
      <Pressable style={[styles.btn, styles.reject]} disabled={busy} onPress={onReject}>
        <Text style={styles.rejectText}>Reject</Text>
      </Pressable>
      {primaryLabel != null && (
        <Pressable style={[styles.btn, styles.approve, busy && styles.btnBusy]} disabled={busy} onPress={onApprove}>
          {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.approveText}>{primaryLabel}</Text>}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet:       { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36, gap: 12 },
  kicker:      { color: colors.fgMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  title:       { color: colors.fg, fontSize: 18, fontWeight: '700' },
  detail:      { color: colors.fgMuted, fontSize: 14 },
  row:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 4 },
  rowTight:    { borderWidth: 0, padding: 0, marginTop: 2 },
  rowLabel:    { color: colors.fgMuted, fontSize: 13 },
  rowValue:    { color: colors.fg, fontSize: 13 },
  signed:      { borderColor: colors.cyan, borderWidth: 1, borderRadius: 8, padding: 12, gap: 2, marginTop: 4 },
  signedKicker:{ color: colors.cyan, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  error:       { color: colors.danger, fontSize: 13 },
  actions:     { flexDirection: 'row', gap: 12, marginTop: 8 },
  btn:         { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  btnBusy:     { opacity: 0.8 },
  reject:      { borderColor: colors.border, borderWidth: 1 },
  rejectText:  { color: colors.fg, fontSize: 15, fontWeight: '600' },
  approve:     { backgroundColor: colors.cyan },
  approveText: { color: colors.bg, fontSize: 15, fontWeight: '700' },
});
