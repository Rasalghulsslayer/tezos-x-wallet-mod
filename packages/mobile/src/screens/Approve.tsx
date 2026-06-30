/**
 * Approve: the in-app modal a dApp connection request is presented through. It
 * reads the pending request from the shared ApprovalQueue (by requestId) and
 * resolves it with the user's decision — the same approve/reject the extension's
 * approve.html drives, minus the cross-context messaging (mobile is in-process).
 *
 * Connect-first scope: only the 'connect' request kind is rendered. Other kinds
 * can't reach here yet (signing methods aren't in the approved namespaces), but
 * a defensive fallback rejects anything unexpected rather than mislead the user.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { shortAddr } from '@tezosx/wallet-core/shared/format';
import { approvalQueue, keyring } from '../composition/wiring';
import { colors } from '../theme';

export function Approve({ requestId }: { requestId: string }): React.JSX.Element | null {
  const pending = approvalQueue.get(requestId);
  if (pending == null) return null;

  const resolve = (decision: 'approve' | 'reject'): void => {
    approvalQueue.resolve(requestId, decision);
  };

  if (pending.kind !== 'connect') {
    // Not part of connect-first; refuse rather than render a misleading prompt.
    return (
      <View style={styles.sheet}>
        <Text style={styles.title}>Unsupported request</Text>
        <Text style={styles.detail}>This request type isn’t supported yet.</Text>
        <Actions onApprove={null} onReject={() => resolve('reject')} />
      </View>
    );
  }

  const unlocked = keyring.getUnlocked();
  const account = unlocked?.account;
  const accountLine =
    account == null ? '' : account.kind === 'tezos' ? shortAddr(account.tz1) : shortAddr(account.address);

  return (
    <View style={styles.sheet}>
      <Text style={styles.kicker}>Connection request</Text>
      <Text style={styles.title}>{pending.origin}</Text>
      <Text style={styles.detail}>wants to connect to your wallet on Tezos L2 (EVM).</Text>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Account</Text>
        <Text style={styles.rowValue}>{accountLine}</Text>
      </View>

      <Actions onApprove={() => resolve('approve')} onReject={() => resolve('reject')} />
    </View>
  );
}

function Actions({
  onApprove,
  onReject,
}: {
  onApprove: (() => void) | null;
  onReject: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.actions}>
      <Pressable style={[styles.btn, styles.reject]} onPress={onReject}>
        <Text style={styles.rejectText}>Reject</Text>
      </Pressable>
      {onApprove != null && (
        <Pressable style={[styles.btn, styles.approve]} onPress={onApprove}>
          <Text style={styles.approveText}>Connect</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet:      { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36, gap: 12 },
  kicker:     { color: colors.fgMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  title:      { color: colors.fg, fontSize: 18, fontWeight: '700' },
  detail:     { color: colors.fgMuted, fontSize: 14 },
  row:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 4 },
  rowLabel:   { color: colors.fgMuted, fontSize: 13 },
  rowValue:   { color: colors.fg, fontSize: 13 },
  actions:    { flexDirection: 'row', gap: 12, marginTop: 8 },
  btn:        { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  reject:     { borderColor: colors.border, borderWidth: 1 },
  rejectText: { color: colors.fg, fontSize: 15, fontWeight: '600' },
  approve:    { backgroundColor: colors.cyan },
  approveText:{ color: colors.bg, fontSize: 15, fontWeight: '700' },
});
