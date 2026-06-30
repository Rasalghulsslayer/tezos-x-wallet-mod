/**
 * Import screen: bring a vault onto the device from a BIP-39 mnemonic. Derives
 * the tz1 identity, encrypts the vault locally with a chosen password (salt/IV
 * from the platform RNG), persists the blob to MMKV, seeds the default tokens,
 * and offers to seal the password behind biometrics for future unlocks.
 */

import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { importAccount } from '@tezosx/wallet-core/use-cases/import-account';
import { unlockVault } from '@tezosx/wallet-core/use-cases/unlock-vault';
import { formatError } from '@tezosx/wallet-core/domain/error';
import { keyring, tokenStore, unlockSecret } from '../composition/wiring';
import { colors } from '../theme';

export function Import({ onDone }: { onDone: () => void }): React.JSX.Element {
  const [mnemonic, setMnemonic] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await importAccount({ source: 'mnemonic', mnemonic: mnemonic.trim(), password }, { keyring });
      // Seed the default tokens (re-unlock is idempotent and leaves the keyring unlocked).
      await unlockVault({ password }, { keyring, tokenStore });
      // Best-effort: offer biometric unlock for next time. A decline/cancel is fine.
      if (await unlockSecret.isBiometryAvailable()) {
        try { await unlockSecret.seal(password); } catch { /* user declined */ }
      }
      onDone();
    } catch (e) {
      const f = formatError(e);
      setError(`${f.title} — ${f.detail}`);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = mnemonic.trim().length > 0 && password.length >= 8 && !busy;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Import a wallet</Text>
      <Text style={styles.subtitle}>Enter your recovery phrase. It is encrypted on this device.</Text>

      <Text style={styles.label}>Recovery phrase</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={mnemonic}
        onChangeText={setMnemonic}
        placeholder="word1 word2 …"
        placeholderTextColor={colors.fgMuted}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        textAlignVertical="top"
      />

      <Text style={styles.label}>Password (min 8 characters)</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Choose a password"
        placeholderTextColor={colors.fgMuted}
        secureTextEntry
        autoCapitalize="none"
      />

      {error != null && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        disabled={!canSubmit}
        onPress={() => void submit()}
      >
        {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.buttonText}>Import</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 80, gap: 12 },
  title:     { color: colors.fg, fontSize: 24, fontWeight: '700' },
  subtitle:  { color: colors.fgMuted, fontSize: 14, marginBottom: 12 },
  label:     { color: colors.fgMuted, fontSize: 12, textTransform: 'uppercase', marginTop: 8 },
  input:     { backgroundColor: colors.surface, color: colors.fg, borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 14, fontSize: 16 },
  multiline: { minHeight: 96 },
  error:     { color: colors.danger, fontSize: 14, marginTop: 4 },
  button:    { backgroundColor: colors.purple, borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 16 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.bg, fontSize: 16, fontWeight: '700' },
});
