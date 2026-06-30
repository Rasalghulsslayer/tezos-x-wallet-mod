import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getState } from '@tezosx/wallet-core/use-cases/get-state';
import type { VaultState } from '@tezosx/wallet-core/shared/messages';
import { keyring, evmAliasCache } from './src/composition/wiring';
import { startAutoLock, type AutoLockHandle } from './src/lock/auto-lock';
import { Import } from './src/screens/Import';
import { Unlock } from './src/screens/Unlock';
import { Home } from './src/screens/Home';
import { colors } from './src/theme';

export default function App(): React.JSX.Element {
  const [state, setState] = useState<VaultState | null>(null);
  const lock = useRef<AutoLockHandle | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setState(await getState({ keyring, evmAliasCache }));
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
  if (state == null) {
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
  root: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center' },
});
