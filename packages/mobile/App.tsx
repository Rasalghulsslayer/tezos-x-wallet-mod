import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { VaultState } from '@tezosx/wallet-core/shared/messages';
import { formatError } from '@tezosx/wallet-core/domain/error';
import { keyring, evmAliasCache, approvalQueue } from './src/composition/wiring';
import { readState } from './src/composition/read-state';
import { startWalletConnect } from './src/composition/walletconnect-connect';
import { approvalUi } from './src/composition/approval-ui';
import { startAutoLock, type AutoLockHandle } from './src/lock/auto-lock';
import { Import } from './src/screens/Import';
import { Unlock } from './src/screens/Unlock';
import { Home } from './src/screens/Home';
import { Approve } from './src/screens/Approve';
import { colors } from './src/theme';

export default function App(): React.JSX.Element {
  const [state, setState] = useState<VaultState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef<AutoLockHandle | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      // Network-free: instant transition. Home resolves the alias + balances.
      setState(await readState());
    } catch (e) {
      console.warn('[mobile] readState failed', e); // surfaces in the Metro terminal
      const f = formatError(e);
      setError(`${f.title} — ${f.detail}`);
    }
  }, []);

  const doLock = useCallback((): void => {
    keyring.lock();
    evmAliasCache.value = null;
    void refresh();
  }, [refresh]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    lock.current = startAutoLock(doLock);
    return () => lock.current?.stop();
  }, [doLock]);

  // Boot WalletConnect once: it routes incoming dApp proposals/requests through
  // the core dispatch, which drives the Approve modal below.
  useEffect(() => {
    startWalletConnect().catch((e) => console.warn('[mobile] WalletConnect init failed', e));
  }, []);

  // The requestId of the dApp request awaiting approval (null = none).
  const pendingApproval = useSyncExternalStore(approvalUi.subscribe, approvalUi.get);

  let body: React.JSX.Element;
  if (error != null) {
    body = (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorText} selectable>{error}</Text>
        <Pressable style={styles.retry} onPress={() => void refresh()}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  } else if (state == null) {
    body = <ActivityIndicator color={colors.purple} />;
  } else if (state.status === 'empty') {
    body = <Import onDone={refresh} />;
  } else if (state.status === 'locked') {
    body = <Unlock onUnlocked={refresh} />;
  } else {
    body = <Home state={state} onLock={doLock} />;
  }

  return (
    <View style={styles.root} onTouchStart={() => lock.current?.touch()}>
      <StatusBar style="light" />
      {body}
      <Modal
        visible={pendingApproval != null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          // Hardware back / swipe-down without a decision = reject.
          if (pendingApproval != null) approvalQueue.resolve(pendingApproval, 'reject');
        }}
      >
        <View style={styles.scrim}>
          {pendingApproval != null && <Approve requestId={pendingApproval} />}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: colors.bg, justifyContent: 'center' },
  scrim:      { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim },
  centered:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  errorTitle: { color: colors.fg, fontSize: 20, fontWeight: '700' },
  errorText:  { color: colors.danger, fontSize: 14, textAlign: 'center' },
  retry:      { borderColor: colors.purple, borderWidth: 1, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24, marginTop: 8 },
  retryText:  { color: colors.purple, fontSize: 15, fontWeight: '600' },
});
