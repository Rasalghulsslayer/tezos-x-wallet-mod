import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getState } from '@tezosx/wallet-core/use-cases/get-state';
import type { VaultState } from '@tezosx/wallet-core/shared/messages';
import { formatError } from '@tezosx/wallet-core/domain/error';
import { keyring, evmAliasCache } from './src/composition/wiring';
import { startAutoLock, type AutoLockHandle } from './src/lock/auto-lock';
import { Import } from './src/screens/Import';
import { Unlock } from './src/screens/Unlock';
import { Home } from './src/screens/Home';
import { colors } from './src/theme';

// getState resolves the EVM alias over the network; bound it so a slow/down RPC
// surfaces as a visible error instead of an indefinite "nothing happens".
const STATE_TIMEOUT_MS = 12_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timed out reaching previewnet')), ms)),
  ]);
}

export default function App(): React.JSX.Element {
  const [state, setState] = useState<VaultState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef<AutoLockHandle | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      setState(await withTimeout(getState({ keyring, evmAliasCache }), STATE_TIMEOUT_MS));
    } catch (e) {
      console.warn('[mobile] getState failed', e); // surfaces in the Metro terminal
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
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: colors.bg, justifyContent: 'center' },
  centered:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  errorTitle: { color: colors.fg, fontSize: 20, fontWeight: '700' },
  errorText:  { color: colors.danger, fontSize: 14, textAlign: 'center' },
  retry:      { borderColor: colors.purple, borderWidth: 1, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24, marginTop: 8 },
  retryText:  { color: colors.purple, fontSize: 15, fontWeight: '600' },
});
