/**
 * Unlock screen: if a password was sealed behind biometrics, prompt for it on
 * mount and unlock automatically; otherwise (or on biometric cancel/invalidation)
 * fall back to manual password entry. Both paths go through unlockVault.
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { unlockVault } from '@tezosx/wallet-core/use-cases/unlock-vault';
import { formatError } from '@tezosx/wallet-core/domain/error';
import { keyring, tokenStore, unlockSecret } from '../composition/wiring';
import { colors } from '../theme';

export function Unlock({ onUnlocked }: { onUnlocked: () => void }): React.JSX.Element {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [biometryOffered, setBiometryOffered] = useState(false);

  async function doUnlock(pw: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await unlockVault({ password: pw }, { keyring, tokenStore });
      onUnlocked();
    } catch (e) {
      const f = formatError(e);
      setError(`${f.title} — ${f.detail}`);
    } finally {
      setBusy(false);
    }
  }

  async function tryBiometric(): Promise<void> {
    const pw = await unlockSecret.retrieve('Unlock your TezosX wallet');
    if (pw != null) await doUnlock(pw);
  }

  // On mount, attempt biometric unlock when a sealed secret is available.
  useEffect(() => {
    void (async () => {
      if ((await unlockSecret.hasSecret()) && (await unlockSecret.isBiometryAvailable())) {
        setBiometryOffered(true);
        await tryBiometric();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Unlock</Text>

      {biometryOffered && (
        <Pressable style={styles.secondary} disabled={busy} onPress={() => void tryBiometric()}>
          <Text style={styles.secondaryText}>Use biometrics</Text>
        </Pressable>
      )}

      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Your password"
        placeholderTextColor={colors.fgMuted}
        secureTextEntry
        autoCapitalize="none"
        onSubmitEditing={() => void doUnlock(password)}
      />

      {error != null && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.button, (password.length === 0 || busy) && styles.buttonDisabled]}
        disabled={password.length === 0 || busy}
        onPress={() => void doUnlock(password)}
      >
        {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.buttonText}>Unlock</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  title:     { color: colors.fg, fontSize: 28, fontWeight: '700', marginBottom: 16 },
  label:     { color: colors.fgMuted, fontSize: 12, textTransform: 'uppercase', marginTop: 8 },
  input:     { backgroundColor: colors.surface, color: colors.fg, borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 14, fontSize: 16 },
  error:     { color: colors.danger, fontSize: 14, marginTop: 4 },
  button:    { backgroundColor: colors.purple, borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 16 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.bg, fontSize: 16, fontWeight: '700' },
  secondary:  { borderColor: colors.purple, borderWidth: 1, borderRadius: 8, padding: 14, alignItems: 'center' },
  secondaryText: { color: colors.purple, fontSize: 15, fontWeight: '600' },
});
