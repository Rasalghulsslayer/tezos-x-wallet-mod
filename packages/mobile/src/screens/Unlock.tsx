/**
 * Unlock — the returning-user password screen (mirrors the design's
 * UnlockScreen). Brand mark + "Welcome back", a single password field, and a
 * ghost link back to onboarding for a lost password. Biometric-first (the sealed
 * password is released by Face ID / Touch ID), with a password fallback; errors
 * surface through formatError.
 */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatError, type FormattedError } from '@tezosx/wallet-core/domain/error';
import { colors, fontSize, radius, space } from '../theme';
import { useWallet } from '../wallet/context';
import { Btn } from '../ui/tx/Btn';
import { ErrorInline } from '../ui/tx/ErrorInline';
import { Icon } from '../ui/icon';
import { LogoMark } from '../ui/tx/LogoMark';

export function Unlock(): React.JSX.Element {
  const ctx = useWallet();
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState<FormattedError | null>(null);
  const [busy, setBusy] = useState(false);

  // Prompt biometrics on mount when a sealed secret is available.
  useEffect(() => {
    if (ctx.biometricsAvailable) void ctx.unlockBiometric().catch(() => { /* fall back to password */ });
  }, [ctx.biometricsAvailable]);

  const submit = (): void => {
    if (!pwd || busy) return;
    setErr(null);
    setBusy(true);
    void (async () => {
      try {
        await ctx.unlock(pwd);
        // Drop the reference now rather than at fiber GC — a JS string can't
        // be overwritten, but nothing should keep pointing at it either.
        setPwd('');
      } catch (e) {
        setErr(formatError(e));
        setPwd('');
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <LogoMark size={56} />
          <View style={styles.pitch}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.sub}>Enter your password to unlock.</Text>
          </View>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            secureTextEntry
            autoFocus
            value={pwd}
            placeholder="Password"
            placeholderTextColor={colors.fgSubtle}
            autoCapitalize="none"
            onChangeText={(v) => {
              setPwd(v);
              setErr(null);
            }}
            onSubmitEditing={submit}
            returnKeyType="go"
          />
          {err != null && <ErrorInline title={err.title} detail={err.detail} />}
          <Btn variant="accent" full loading={busy} disabled={!pwd} onPress={submit}>
            Unlock
          </Btn>
          {ctx.biometricsAvailable && (
            <Btn variant="ghost" full disabled={busy} onPress={() => void ctx.unlockBiometric().catch(() => {})}>
              <Icon name="lock" size={15} color={colors.fgMuted} />
              <Text style={styles.bioText}>Use biometrics</Text>
            </Btn>
          )}
        </View>

        <Pressable onPress={() => ctx.resetToWelcome()} style={styles.forgot}>
          <Text style={styles.forgotText}>Forgot password? Import with seed phrase</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 44, paddingBottom: space[6] },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 18 },
  pitch: { alignItems: 'center' },
  title: { fontSize: fontSize['2xl'], fontWeight: '600', letterSpacing: -0.36, color: colors.fg },
  sub: { fontSize: fontSize.md, color: colors.fgMuted, marginTop: space[2] },
  form: { gap: space[3] },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.md,
    color: colors.fg,
    fontSize: fontSize.md,
    height: 52,
    paddingHorizontal: 16,
  },
  bioText: { color: colors.fgMuted, fontSize: fontSize.md, fontWeight: '600' },
  forgot: { marginTop: space[4], alignItems: 'center' },
  forgotText: { color: colors.fgMuted, fontSize: fontSize.sm },
});
